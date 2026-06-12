import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/connection';
import { dnsRecords, dnsProviders, domains, operationLogs } from '@/lib/db/schema';
import { decryptJSON } from '@/lib/encryption';
import { DNSProviderFactory, ProviderType } from '@/lib/providers/base';
import { eq, and } from 'drizzle-orm';
import { DNSAction, isBatchInstruction, DNSInstruction } from '@/lib/ai/parser';

/**
 * POST /api/ai/execute
 * 执行 AI 解析后的 DNS 操作（支持单条和批量）
 */
export async function POST(request: NextRequest) {

  try {
    const body = await request.json();

    // 检查是否是批量指令
    if (body.batch === true && Array.isArray(body.instructions) && body.instructions.length > 0) {
      return await executeBatchInstruction(body.instructions);
    }

    // 解析单条指令
    let { action, domain, type, name, content, oldContent, ttl = 600, priority } = body;

    // 验证必填字段
    if (!action || !domain || !type) {
      return NextResponse.json(
        { success: false, error: 'action, domain, and type are required' },
        { status: 400 }
      );
    }

    // 查找域名
    let domainRecord = null;

    // 首先尝试精确匹配
    console.log('[AI Execute] Looking for domain:', domain);
    [domainRecord] = await db.select().from(domains).where(eq(domains.name, domain));
    console.log('[AI Execute] Exact match result:', domainRecord ? `Found (id=${domainRecord.id}, name=${domainRecord.name})` : 'Not found');

    // 如果找不到，尝试查找父域名（例如 opai.bmxdr.de -> bmxdr.de）
    if (!domainRecord) {
      const parts = domain.split('.');
      console.log('[AI Execute] Domain parts:', parts, `Length: ${parts.length}`);
      if (parts.length > 2) {
        const parentDomain = parts.slice(1).join('.');
        console.log('[AI Execute] Looking for parent domain:', parentDomain);

        // 先查询所有域名，看看有哪些
        const allDoms = await db.select().from(domains).limit(5);
        console.log('[AI Execute] All domains sample:', allDoms.map((d: any) => d.name));

        [domainRecord] = await db.select().from(domains).where(eq(domains.name, parentDomain));
        console.log('[AI Execute] Parent match result:', domainRecord ? `Found (id=${domainRecord.id}, name=${domainRecord.name})` : 'Not found');

        if (domainRecord) {
          // 如果找到父域名，提取子域名作为记录名称
          const subdomain = parts[0];
          console.log('[AI Execute] Subdomain:', subdomain, 'Original name:', name);
          // 如果 name 是 '@'，则替换为子域名
          if (name === '@' || !name) {
            name = subdomain;
          } else {
            // 否则，拼接子域名（例如 www + opai = opai.www）
            name = `${subdomain}.${name}`;
          }
          console.log('[AI Execute] Updated name:', name);
        }
      }
    }

    if (!domainRecord) {
      // 获取所有可用域名列表作为提示
      const allDomains = await db.select({ name: domains.name }).from(domains).limit(10);
      const availableDomains = allDomains.map((d: any) => d.name).join(', ');
      const parts = domain.split('.');
      const parentDomain = parts.length > 2 ? parts.slice(1).join('.') : 'N/A';

      return NextResponse.json(
        {
          success: false,
          error: `Domain "${domain}" not found in database. Parent candidate: "${parentDomain}". Available domains: ${availableDomains}. Please sync the domain first.`,
        },
        { status: 404 }
      );
    }

    // 查找服务商
    const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domainRecord.providerId));

    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    // 解密凭证
    const credentials = decryptJSON(provider.credentials);

    // 创建 Provider 实例
    const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

    // 根据操作类型执行
    let result: any;

    switch (action) {
      case DNSAction.CREATE: {
        // 验证必填字段
        if (!name || !content) {
          return NextResponse.json(
            { success: false, error: 'name and content are required for CREATE action' },
            { status: 400 }
          );
        }

        // 调用 Provider API 创建记录
        const createResult = await dnsProvider.addRecord(domain, {
          type,
          name,
          content,
          ttl,
          priority,
        });

        if (!createResult.success || !createResult.data) {
          // 记录失败日志
          await db.insert(operationLogs).values({
            action: 'CREATE',
            entityType: 'record',
            entityId: 0,
            details: JSON.stringify({ domain, type, name, content, ttl, priority }),
            status: 'failed',
            errorMessage: createResult.error || 'Failed to create record',
            createdBy: 'ai',
          });

          return NextResponse.json(
            { success: false, error: createResult.error || 'Failed to create record' },
            { status: 500 }
          );
        }

        // 保存到数据库
        const [created] = await db
          .insert(dnsRecords)
          .values({
            domainId: domainRecord.id,
            type,
            name,
            content,
            ttl,
            priority,
            providerRecordId: createResult.data.id,
            isActive: true,
          })
          .returning();

        // 记录成功日志
        await db.insert(operationLogs).values({
          action: 'CREATE',
          entityType: 'record',
          entityId: created.id,
          details: JSON.stringify({
            domain,
            type,
            name,
            content,
            ttl,
            priority,
          }),
          status: 'success',
          createdBy: 'ai',
        });

        result = { success: true, data: created, message: `成功创建 ${type} 记录` };
        break;
      }

      case DNSAction.UPDATE: {
        // 验证必填字段
        if (!name || !content) {
          return NextResponse.json(
            { success: false, error: 'name and content are required for UPDATE action' },
            { status: 400 }
          );
        }

        // 查找现有记录（使用 oldContent 匹配）
        const conditions = [
          eq(dnsRecords.domainId, domainRecord.id),
          eq(dnsRecords.type, type),
          eq(dnsRecords.name, name),
        ];

        // 如果提供了 oldContent，使用它来精确匹配
        if (oldContent) {
          conditions.push(eq(dnsRecords.content, oldContent));
        }

        const [existingRecord] = await db
          .select()
          .from(dnsRecords)
          .where(and(...conditions));

        if (!existingRecord) {
          return NextResponse.json(
            {
              success: false,
              error: oldContent
                ? `Record not found. No matching record with oldContent="${oldContent}"`
                : `Record not found. Please specify the old content for confirmation.`,
            },
            { status: 404 }
          );
        }

        // 调用 Provider API 更新记录
        const updateResult = await dnsProvider.updateRecord(domain, existingRecord.providerRecordId!, {
          type,
          name,
          content,
          ttl,
          priority,
        });

        if (!updateResult.success || !updateResult.data) {
          // 记录失败日志
          await db.insert(operationLogs).values({
            action: 'UPDATE',
            entityType: 'record',
            entityId: existingRecord.id,
            details: JSON.stringify({
              domain,
              type,
              name,
              oldContent: existingRecord.content,
              newContent: content,
              ttl,
              priority,
            }),
            status: 'failed',
            errorMessage: updateResult.error || 'Failed to update record',
            createdBy: 'ai',
          });

          return NextResponse.json(
            { success: false, error: updateResult.error || 'Failed to update record' },
            { status: 500 }
          );
        }

        // 更新数据库
        const [updated] = await db
          .update(dnsRecords)
          .set({
            type,
            name,
            content,
            ttl,
            priority,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(dnsRecords.id, existingRecord.id))
          .returning();

        // 记录成功日志
        await db.insert(operationLogs).values({
          action: 'UPDATE',
          entityType: 'record',
          entityId: updated.id,
          details: JSON.stringify({
            domain,
            type,
            name,
            oldContent: existingRecord.content,
            newContent: content,
            ttl,
            priority,
          }),
          status: 'success',
          createdBy: 'ai',
        });

        result = {
          success: true,
          data: updated,
          message: `成功更新 ${type} 记录`,
        };
        break;
      }

      case DNSAction.DELETE: {
        // 验证必填字段
        if (!name) {
          return NextResponse.json(
            { success: false, error: 'name is required for DELETE action' },
            { status: 400 }
          );
        }

        // 查找记录
        const conditions = [
          eq(dnsRecords.domainId, domainRecord.id),
          eq(dnsRecords.type, type),
          eq(dnsRecords.name, name),
        ];

        // 如果提供了 content，使用它来精确匹配
        if (content) {
          conditions.push(eq(dnsRecords.content, content));
        }

        const [existingRecord] = await db
          .select()
          .from(dnsRecords)
          .where(and(...conditions));

        if (!existingRecord) {
          return NextResponse.json(
            {
              success: false,
              error: `Record not found. No matching ${type} record with name="${name}"${content ? ` and content="${content}"` : ''}`,
            },
            { status: 404 }
          );
        }

        // 调用 Provider API 删除记录
        const deleteResult = await dnsProvider.deleteRecord(domain, existingRecord.providerRecordId!);

        if (!deleteResult.success) {
          // 记录失败日志
          await db.insert(operationLogs).values({
            action: 'DELETE',
            entityType: 'record',
            entityId: existingRecord.id,
            details: JSON.stringify({
              domain,
              type,
              name,
              content: existingRecord.content,
            }),
            status: 'failed',
            errorMessage: deleteResult.error || 'Failed to delete record',
            createdBy: 'ai',
          });

          return NextResponse.json(
            { success: false, error: deleteResult.error || 'Failed to delete record' },
            { status: 500 }
          );
        }

        // 记录成功日志
        await db.insert(operationLogs).values({
          action: 'DELETE',
          entityType: 'record',
          entityId: existingRecord.id,
          details: JSON.stringify({
            domain,
            type,
            name,
            content: existingRecord.content,
          }),
          status: 'success',
          createdBy: 'ai',
        });

        // 删除数据库记录
        await db.delete(dnsRecords).where(eq(dnsRecords.id, existingRecord.id));

        result = {
          success: true,
          message: `成功删除 ${type} 记录`,
        };
        break;
      }

      case DNSAction.QUERY: {
        // 查询记录
        const conditions = [eq(dnsRecords.domainId, domainRecord.id)];

        if (type) {
          conditions.push(eq(dnsRecords.type, type));
        }
        if (name) {
          conditions.push(eq(dnsRecords.name, name));
        }
        if (content) {
          conditions.push(eq(dnsRecords.content, content));
        }

        const records = await db.select().from(dnsRecords).where(and(...conditions));

        result = {
          success: true,
          data: records,
          message: `查询到 ${records.length} 条记录`,
        };
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Execute AI instruction error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * 执行批量 DNS 指令
 */
async function executeBatchInstruction(instructions: DNSInstruction[]): Promise<NextResponse> {
  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < instructions.length; i++) {
    const instruction = instructions[i];
    const { action, domain, type, name, content, oldContent, ttl = 600, priority } = instruction;

    console.log(`[AI Execute Batch] Processing ${i + 1}/${instructions.length}:`, {
      action,
      domain,
      type,
      name,
      content,
    });

    try {
      // 查找域名
      let domainRecord = null;

      // 首先尝试精确匹配
      [domainRecord] = await db.select().from(domains).where(eq(domains.name, domain));

      // 如果找不到，尝试查找父域名
      if (!domainRecord) {
        const parts = domain.split('.');
        if (parts.length > 2) {
          const parentDomain = parts.slice(1).join('.');
          [domainRecord] = await db.select().from(domains).where(eq(domains.name, parentDomain));

          if (domainRecord) {
            const subdomain = parts[0];
            // 如果 name 是 '@'，则替换为子域名
            if (name === '@' || !name) {
              (instruction as any).name = subdomain;
            } else {
              // 否则，拼接子域名
              (instruction as any).name = `${subdomain}.${name}`;
            }
          }
        }
      }

      if (!domainRecord) {
        const allDomains = await db.select({ name: domains.name }).from(domains).limit(10);
        const availableDomains = allDomains.map((d: any) => d.name).join(', ');

        results.push({
          index: i + 1,
          success: false,
          error: `Domain "${domain}" not found. Available: ${availableDomains}`,
          instruction,
        });
        failureCount++;
        continue;
      }

      // 查找服务商
      const [provider] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, domainRecord.providerId));

      if (!provider) {
        results.push({
          index: i + 1,
          success: false,
          error: 'Provider not found',
          instruction,
        });
        failureCount++;
        continue;
      }

      // 解密凭证
      const credentials = decryptJSON(provider.credentials);

      // 创建 Provider 实例
      const dnsProvider = DNSProviderFactory.create(provider.type as ProviderType, credentials);

      // 根据操作类型执行
      let result: any;

      switch (action) {
        case DNSAction.CREATE: {
          if (!name || !content) {
            results.push({
              index: i + 1,
              success: false,
              error: 'name and content are required for CREATE action',
              instruction,
            });
            failureCount++;
            continue;
          }

          const createResult = await dnsProvider.addRecord(domain, {
            type,
            name: instruction.name || name,
            content,
            ttl,
            priority,
          });

          if (!createResult.success || !createResult.data) {
            await db.insert(operationLogs).values({
              action: 'CREATE',
              entityType: 'record',
              entityId: 0,
              details: JSON.stringify({ domain, type, name: instruction.name || name, content, ttl, priority }),
              status: 'failed',
              errorMessage: createResult.error || 'Failed to create record',
              createdBy: 'ai',
            });

            results.push({
              index: i + 1,
              success: false,
              error: createResult.error || 'Failed to create record',
              instruction,
            });
            failureCount++;
            continue;
          }

          const [created] = await db
            .insert(dnsRecords)
            .values({
              domainId: domainRecord.id,
              type,
              name: instruction.name || name,
              content,
              ttl,
              priority,
              providerRecordId: createResult.data.id,
              isActive: true,
            })
            .returning();

          await db.insert(operationLogs).values({
            action: 'CREATE',
            entityType: 'record',
            entityId: created.id,
            details: JSON.stringify({
              domain,
              type,
              name: instruction.name || name,
              content,
              ttl,
              priority,
            }),
            status: 'success',
            createdBy: 'ai',
          });

          result = { success: true, data: created, message: `成功创建 ${type} 记录` };
          break;
        }

        case DNSAction.UPDATE: {
          if (!name || !content) {
            results.push({
              index: i + 1,
              success: false,
              error: 'name and content are required for UPDATE action',
              instruction,
            });
            failureCount++;
            continue;
          }

          const conditions = [
            eq(dnsRecords.domainId, domainRecord.id),
            eq(dnsRecords.type, type),
            eq(dnsRecords.name, instruction.name || name),
          ];

          if (oldContent) {
            conditions.push(eq(dnsRecords.content, oldContent));
          }

          const [existingRecord] = await db
            .select()
            .from(dnsRecords)
            .where(and(...conditions));

          if (!existingRecord) {
            results.push({
              index: i + 1,
              success: false,
              error: oldContent
                ? `Record not found. No matching record with oldContent="${oldContent}"`
                : `Record not found. Please specify the old content for confirmation.`,
              instruction,
            });
            failureCount++;
            continue;
          }

          const updateResult = await dnsProvider.updateRecord(domain, existingRecord.providerRecordId!, {
            type,
            name: instruction.name || name,
            content,
            ttl,
            priority,
          });

          if (!updateResult.success || !updateResult.data) {
            await db.insert(operationLogs).values({
              action: 'UPDATE',
              entityType: 'record',
              entityId: existingRecord.id,
              details: JSON.stringify({
                domain,
                type,
                name: instruction.name || name,
                oldContent: existingRecord.content,
                newContent: content,
                ttl,
                priority,
              }),
              status: 'failed',
              errorMessage: updateResult.error || 'Failed to update record',
              createdBy: 'ai',
            });

            results.push({
              index: i + 1,
              success: false,
              error: updateResult.error || 'Failed to update record',
              instruction,
            });
            failureCount++;
            continue;
          }

          const [updated] = await db
            .update(dnsRecords)
            .set({
              type,
              name: instruction.name || name,
              content,
              ttl,
              priority,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(dnsRecords.id, existingRecord.id))
            .returning();

          await db.insert(operationLogs).values({
            action: 'UPDATE',
            entityType: 'record',
            entityId: updated.id,
            details: JSON.stringify({
              domain,
              type,
              name: instruction.name || name,
              oldContent: existingRecord.content,
              newContent: content,
              ttl,
              priority,
            }),
            status: 'success',
            createdBy: 'ai',
          });

          result = {
            success: true,
            data: updated,
            message: `成功更新 ${type} 记录`,
          };
          break;
        }

        case DNSAction.DELETE: {
          if (!name) {
            results.push({
              index: i + 1,
              success: false,
              error: 'name is required for DELETE action',
              instruction,
            });
            failureCount++;
            continue;
          }

          const conditions = [
            eq(dnsRecords.domainId, domainRecord.id),
            eq(dnsRecords.type, type),
            eq(dnsRecords.name, instruction.name || name),
          ];

          if (content) {
            conditions.push(eq(dnsRecords.content, content));
          }

          const [existingRecord] = await db
            .select()
            .from(dnsRecords)
            .where(and(...conditions));

          if (!existingRecord) {
            results.push({
              index: i + 1,
              success: false,
              error: `Record not found. No matching ${type} record with name="${instruction.name || name}"${content ? ` and content="${content}"` : ''}`,
              instruction,
            });
            failureCount++;
            continue;
          }

          const deleteResult = await dnsProvider.deleteRecord(domain, existingRecord.providerRecordId!);

          if (!deleteResult.success) {
            await db.insert(operationLogs).values({
              action: 'DELETE',
              entityType: 'record',
              entityId: existingRecord.id,
              details: JSON.stringify({
                domain,
                type,
                name: instruction.name || name,
                content: existingRecord.content,
              }),
              status: 'failed',
              errorMessage: deleteResult.error || 'Failed to delete record',
              createdBy: 'ai',
            });

            results.push({
              index: i + 1,
              success: false,
              error: deleteResult.error || 'Failed to delete record',
              instruction,
            });
            failureCount++;
            continue;
          }

          await db.insert(operationLogs).values({
            action: 'DELETE',
            entityType: 'record',
            entityId: existingRecord.id,
            details: JSON.stringify({
              domain,
              type,
              name: instruction.name || name,
              content: existingRecord.content,
            }),
            status: 'success',
            createdBy: 'ai',
          });

          await db.delete(dnsRecords).where(eq(dnsRecords.id, existingRecord.id));

          result = {
            success: true,
            message: `成功删除 ${type} 记录`,
          };
          break;
        }

        case DNSAction.QUERY: {
          const conditions = [eq(dnsRecords.domainId, domainRecord.id)];

          if (type) {
            conditions.push(eq(dnsRecords.type, type));
          }
          const effectiveName = instruction.name || name;
          if (effectiveName) {
            conditions.push(eq(dnsRecords.name, effectiveName));
          }
          if (content) {
            conditions.push(eq(dnsRecords.content, content));
          }

          const records = await db.select().from(dnsRecords).where(and(...conditions));

          result = {
            success: true,
            data: records,
            message: `查询到 ${records.length} 条记录`,
          };
          break;
        }

        default:
          results.push({
            index: i + 1,
            success: false,
            error: `Unsupported action: ${action}`,
            instruction,
          });
          failureCount++;
          continue;
      }

      results.push({
        index: i + 1,
        success: result.success,
        message: result.message,
        data: result.data,
        instruction,
      });
      successCount++;

    } catch (error) {
      console.error(`[AI Execute Batch] Error processing instruction ${i + 1}:`, error);
      results.push({
        index: i + 1,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        instruction,
      });
      failureCount++;
    }
  }

  // 返回批量执行结果
  return NextResponse.json({
    success: failureCount === 0,
    message: `批量执行完成：成功 ${successCount} 条，失败 ${failureCount} 条`,
    total: instructions.length,
    successCount,
    failureCount,
    results,
  });
}

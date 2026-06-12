import { getProviders } from '@/app/_actions/providers';

export async function GET() {
  try {
    const result = await getProviders();
    return Response.json(result);
  } catch (error) {
    console.error('Get providers API error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

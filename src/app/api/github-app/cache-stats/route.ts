import { NextRequest, NextResponse } from 'next/server';
import { githubAppService } from '@/lib/github-app';

export async function GET(request: NextRequest) {
  try {
    // Check if GitHub App is configured
    if (!githubAppService.isConfigured()) {
      return NextResponse.json({ 
        error: 'GitHub App not configured',
        cacheStats: null
      });
    }

    const cacheStats = githubAppService.getCacheStats();
    
    return NextResponse.json({ 
      cacheStats,
      message: 'Cache statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Error getting cache stats:', error);
    return NextResponse.json({ 
      error: 'Failed to get cache statistics' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check if GitHub App is configured
    if (!githubAppService.isConfigured()) {
      return NextResponse.json({ 
        error: 'GitHub App not configured'
      });
    }

    githubAppService.clearAllInstallationCache();
    
    return NextResponse.json({ 
      message: 'All installation cache cleared successfully'
    });

  } catch (error) {
    console.error('Error clearing cache:', error);
    return NextResponse.json({ 
      error: 'Failed to clear cache' 
    }, { status: 500 });
  }
} 
import jwt from 'jsonwebtoken';

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
}

interface InstallationCache {
  installationId: number;
  expiresAt: number;
}

class GitHubAppService {
  private config: GitHubAppConfig;
  private installationCache: Map<string, InstallationCache> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    this.config = {
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    };
  }

  /**
   * Generate a JWT token for GitHub App authentication
   */
  generateJWT(): string {
    if (!this.config.appId || !this.config.privateKey) {
      throw new Error('GitHub App ID or Private Key not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now,
      exp: now + 600, // 10 minutes
      iss: this.config.appId,
    };

    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Check if GitHub App is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.appId && this.config.privateKey);
  }

  /**
   * Get the app configuration for debugging
   */
  getConfig(): Partial<GitHubAppConfig> {
    return {
      appId: this.config.appId ? 'configured' : 'missing',
      privateKey: this.config.privateKey ? 'configured' : 'missing',
    };
  }

  /**
   * Get cached installation ID or fetch from GitHub
   */
  async getInstallationIdForRepo(owner: string, repo: string): Promise<number> {
    // Cache by owner only, since installation ID is per account/org, not per repo
    const cacheKey = owner;
    const cached = this.installationCache.get(cacheKey);

    // Check if we have a valid cached installation ID
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`📦 Using cached installation ID for ${owner} (${repo})`);
      return cached.installationId;
    }

    // Fetch from GitHub API
    console.log(`🔄 Fetching installation ID for ${owner} (${repo})`);
    const installationId = await this.fetchInstallationIdFromGitHub(owner, repo);

    // Cache the result by owner
    this.installationCache.set(cacheKey, {
      installationId,
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    console.log(`💾 Cached installation ID ${installationId} for ${owner}`);
    return installationId;
  }

  /**
   * Fetch installation ID from GitHub API
   */
  private async fetchInstallationIdFromGitHub(owner: string, repo: string): Promise<number> {
    if (!this.config.appId || !this.config.privateKey) {
      throw new Error('GitHub App ID or Private Key not configured');
    }
    
    const jwt = this.generateJWT();
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/installation`,
      {
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get installation ID: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    return data.id;
  }

  /**
   * Get an installation token for a specific repository (owner/repo)
   */
  async getInstallationTokenForRepo(owner: string, repo: string): Promise<string> {
    const installationId = await this.getInstallationIdForRepo(owner, repo);
    const jwt = this.generateJWT();
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get installation token: ${response.status} - ${error}`);
    }
    const data = await response.json();
    return data.token;
  }

  /**
   * Clear installation ID cache for a specific owner/organization
   */
  clearInstallationCache(owner: string, repo?: string): void {
    const cacheKey = owner;
    this.installationCache.delete(cacheKey);
    console.log(`🗑️ Cleared installation cache for ${owner}${repo ? ` (${repo})` : ''}`);
  }

  /**
   * Clear all installation ID cache
   */
  clearAllInstallationCache(): void {
    this.installationCache.clear();
    console.log(`🗑️ Cleared all installation cache`);
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; entries: Array<{ key: string; expiresAt: number }> } {
    const entries = Array.from(this.installationCache.entries()).map(([key, value]) => ({
      key,
      expiresAt: value.expiresAt,
    }));
    
    return {
      size: this.installationCache.size,
      entries,
    };
  }
}

// Export singleton instance
export const githubAppService = new GitHubAppService(); 
# Hugging Face Setup Guide

This guide will help you set up Hugging Face as your AI provider for Mega Miyya. Hugging Face is **recommended for production** because it offers free hosted LLMs with no infrastructure management required.

## Quick Setup

### 1. Create Hugging Face Account

1. Go to [huggingface.co](https://huggingface.co/)
2. Click "Sign Up" and create a free account
3. Verify your email address

### 2. Get Your API Key

1. Go to [Settings > Access Tokens](https://huggingface.co/settings/tokens)
2. Click "New token"
3. Give it a name (e.g., "Mega Miyya Code Review")
4. Select **"Make calls to Inference Providers"** scope
5. Click "Generate token"
6. **Copy the token** (it starts with `hf_`)

### 3. Configure Environment Variables

Add these to your `.env.local`:

```env
# AI Provider Configuration
AI_PROVIDER=huggingface

# Hugging Face Configuration (Inference Providers)
HUGGINGFACE_API_KEY=hf_your_token_here
HUGGINGFACE_PROVIDER=novita
HUGGINGFACE_MODEL=deepseek/deepseek-r1-0528
```

## Available Providers

Hugging Face now uses **Inference Providers** which offer better performance and reliability. Choose from:

| Provider | Description | Recommended |
|----------|-------------|-------------|
| **novita** | Fast, reliable, good for code review | ✅ **Yes** |
| **together** | Large model support | ✅ **Yes** |
| **fireworks** | High performance | ✅ **Yes** |
| **cohere** | Good for text analysis | ✅ **Yes** |
| **fal-ai** | Fast inference | ✅ **Yes** |
| **groq** | Ultra-fast inference | ✅ **Yes** |

## Recommended Models by Provider

### Novita Provider (Recommended)
Based on [Novita's documentation](https://huggingface.co/docs/inference-providers/providers/novita), available models:

1. **`deepseek/deepseek-r1-0528`** (Default) - Excellent for code analysis
2. **`meta-llama/Llama-4-Scout-17B-16E-Instruct`** - Good for general tasks
3. **`Wan-AI/Wan2.1-T2V-14B`** - For video generation (not for code review)

### Other Providers
For other providers, you can use:
- **`deepseek-ai/deepseek-v3-0324`** - Available on many providers
- **`microsoft/DialoGPT-medium`** - Good for general text
- **`gpt2`** - Reliable fallback option

## Testing Your Setup

### 1. Test with cURL

```bash
curl https://router.huggingface.co/novita/v3/openai/chat/completions \
    -H "Authorization: Bearer $HUGGINGFACE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
        "messages": [
            {
                "role": "user",
                "content": "Review this code: function add(a, b) { return a + b; }"
            }
        ],
        "model": "deepseek/deepseek-r1-0528",
        "stream": false
    }'
```

### 2. Test in Application

1. Restart your development server
2. Create a test pull request
3. Check if AI review is generated

## Free Tier Limits

- **Community Models**: Generous free tier
- **Inference Providers**: Varies by provider
- **Novita**: Good free tier for development
- **Together**: Large free tier available

## Troubleshooting

### Common Issues

1. **"Not Found" Error**
   - Check if the model exists for your chosen provider
   - Try a different provider or model
   - See provider-specific documentation for available models

2. **"Unauthorized" Error**
   - Verify your API key is correct
   - Check if token has "Inference Providers" scope

3. **"Rate Limited" Error**
   - Consider upgrading to Hugging Face Pro
   - Try a different provider

### Provider-Specific Issues

- **Novita**: Usually most reliable, check [Novita docs](https://huggingface.co/docs/inference-providers/providers/novita) for available models
- **Together**: Good for large models
- **Fireworks**: Fast but may have limits
- **Cohere**: Good for text analysis

## Production Deployment

For production use:

1. **Use a production API key** with appropriate scopes
2. **Set up monitoring** for API usage
3. **Choose a reliable provider** (novita recommended)
4. **Monitor costs** in Hugging Face dashboard

Monitor your Hugging Face usage at:
- [Hugging Face Dashboard](https://huggingface.co/settings/billing)
- [Inference Providers Documentation](https://huggingface.co/docs/inference-providers/index)

## Resources

- [Inference Providers Documentation](https://huggingface.co/docs/inference-providers/index)
- [Novita Provider Documentation](https://huggingface.co/docs/inference-providers/providers/novita)
- [Hugging Face Models](https://huggingface.co/models)
- [API Reference](https://huggingface.co/docs/api-inference)

## Support

If you encounter issues:

- Check the [Inference Providers documentation](https://huggingface.co/docs/inference-providers/index)
- Visit [Hugging Face Community](https://huggingface.co/community)
- Create an issue in this repository

**That's it!** You're now ready to use Hugging Face for AI-powered code reviews. The new Inference Providers system is more reliable and production-ready. 
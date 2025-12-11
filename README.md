# 🕷️ Venom

A powerful web crawler that screenshots websites and generates intelligent captions using Vision-Language Models (VLMs).

## Features

- **Full-Page Screenshots** - Capture complete website screenshots using Playwright headless browser
- **HTML/CSS Extraction** - Extract and clean rendered HTML, harvest and bundle all CSS (inline + linked stylesheets)
- **VLM Captioning** - Generate intelligent descriptions using multiple VLM providers:
  - **Anthropic Claude** (claude-sonnet-4-20250514, claude-3-5-sonnet, etc.)
  - **OpenAI GPT-4 Vision** (gpt-4o, gpt-4-vision-preview, etc.)
  - **Ollama** (llava, bakllava, or any local vision model)
- **Job Queue** - Robust queue system for managing crawl jobs with priority levels
- **robots.txt Compliance** - Respects robots.txt by default
- **SQLite Storage** - Efficient metadata storage with full-text search capability
- **Configurable** - Crawl depth, rate limiting, concurrency, and more

## Architecture

```
src/
├── crawler/           # Playwright crawling logic & robots.txt
│   ├── crawler.ts     # Core web crawler
│   └── robots.ts      # robots.txt parser
├── processors/        # HTML/CSS extraction and cleaning
│   ├── html-processor.ts
│   └── css-processor.ts
├── captioning/        # VLM integration (modular provider system)
│   ├── captioner.ts   # Main captioner orchestrator
│   ├── provider.ts    # Abstract provider interface
│   └── providers/     # Provider implementations
│       ├── anthropic.ts
│       ├── openai.ts
│       └── ollama.ts
├── storage/           # Persistence layer
│   ├── database.ts    # SQLite for metadata
│   └── filesystem.ts  # Screenshot storage
├── queue/             # Job queue management
│   └── job-queue.ts
├── venom.ts           # Main orchestrator
├── config.ts          # Configuration loading
├── logger.ts          # Winston logger
├── types.ts           # TypeScript definitions
└── index.ts           # CLI entry point

data/
├── screenshots/       # Captured screenshots
└── metadata/          # Additional metadata files

config/
└── venom.json         # Default configuration
```

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/venom.git
cd venom

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment file and add your API keys
cp .env.example .env
```

## Configuration

### Environment Variables

```bash
# For Anthropic Claude
ANTHROPIC_API_KEY=your-api-key

# For OpenAI GPT-4 Vision
OPENAI_API_KEY=your-api-key

# For other providers
VLM_API_KEY=your-api-key
```

### Configuration File (config/venom.json)

```json
{
  "crawler": {
    "maxDepth": 2,
    "rateLimit": 1000,
    "concurrency": 3,
    "timeout": 30000,
    "respectRobotsTxt": true,
    "userAgent": "Venom/1.0",
    "viewportWidth": 1920,
    "viewportHeight": 1080,
    "fullPage": true,
    "maxUrlsPerDomain": 100
  },
  "captioning": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 1024,
    "includeHtml": true,
    "includeCss": false
  },
  "storage": {
    "dataDir": "./data",
    "dbPath": "./data/venom.db"
  }
}
```

## Usage

### CLI Commands

```bash
# Crawl with default seed URLs
npm run crawl

# Crawl specific URLs
npm run dev -- crawl -u https://example.com -u https://another.com

# Crawl with custom depth and concurrency
npm run dev -- crawl -u https://example.com -d 3 -c 5

# Crawl without captioning
npm run dev -- crawl -u https://example.com --no-caption

# Crawl a single URL
npm run dev -- single https://example.com

# Generate captions for existing captures
npm run dev -- caption -l 50

# Use a different VLM provider
npm run dev -- crawl -u https://example.com -p openai --model gpt-4o

# Use local Ollama
npm run dev -- crawl -u https://example.com -p ollama --model llava

# Show statistics
npm run dev -- stats

# List available providers
npm run dev -- providers
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-u, --urls` | URLs to crawl | Seed URLs |
| `-d, --depth` | Maximum crawl depth | 2 |
| `-c, --concurrency` | Concurrent pages | 3 |
| `-r, --rate-limit` | Delay between requests (ms) | 1000 |
| `-p, --provider` | VLM provider | anthropic |
| `--model` | Model to use | claude-sonnet-4-20250514 |
| `--no-caption` | Disable captioning | false |
| `--no-robots` | Ignore robots.txt | false |
| `-m, --max-urls` | Maximum URLs to crawl | unlimited |
| `--config` | Config file path | config/venom.json |
| `-v, --verbose` | Verbose logging | false |

### Programmatic Usage

```typescript
import { Venom } from './src/venom.js';
import { loadConfig } from './src/config.js';
import { createLogger } from './src/logger.js';

const config = loadConfig();
const logger = createLogger('info');

const venom = new Venom(config, logger);
await venom.init();

// Add seed URLs
venom.addSeeds([
  'https://en.wikipedia.org/wiki/Web_crawler',
  'https://news.ycombinator.com',
]);

// Start crawling
const stats = await venom.crawl({
  captionOnCrawl: true,
  maxUrls: 100,
});

console.log('Crawl stats:', stats);

await venom.close();
```

### Using Different VLM Providers

```typescript
// Anthropic Claude
const config = {
  captioning: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  }
};

// OpenAI GPT-4 Vision
const config = {
  captioning: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,
  }
};

// Local Ollama
const config = {
  captioning: {
    provider: 'ollama',
    model: 'llava',
    baseUrl: 'http://localhost:11434',
  }
};
```

## Default Seed URLs

For testing, Venom includes these default seed URLs:

- Wikipedia (Web Crawler article)
- Hacker News
- Stripe.com
- Amazon.com
- BBC News

## Capture Output

Each capture includes:

```typescript
{
  id: string,              // Unique capture ID
  url: string,             // Original URL
  normalizedUrl: string,   // Normalized URL (deduplication)
  domain: string,          // Domain name
  depth: number,           // Crawl depth from seed
  timestamp: Date,         // Capture timestamp
  screenshotPath: string,  // Path to screenshot file
  html: {
    html: string,          // Cleaned HTML content
    title: string,         // Page title
    description: string,   // Meta description
    links: [],             // Extracted links
    textContent: string,   // Visible text content
  },
  css: {
    css: string,           // Combined CSS
    stylesheetCount: number,
    originalSize: number,
  },
  statusCode: number,      // HTTP status
  finalUrl: string,        // URL after redirects
  loadTime: number,        // Page load time (ms)
  caption: {
    caption: string,       // Generated description
    visualElements: [],    // Key visual elements
    pageType: string,      // Page type classification
    confidence: number,    // Confidence score (0-1)
    model: string,         // Model used
    timestamp: Date,
    tokensUsed: number,
  }
}
```

## Adding Custom VLM Providers

Create a new provider by extending `VlmProvider`:

```typescript
import { VlmProvider, VlmProviderRegistry } from './captioning/provider.js';

class MyCustomProvider extends VlmProvider {
  get name(): string {
    return 'custom';
  }

  validate(): string[] {
    // Return validation errors
    return [];
  }

  async caption(input, prompt): Promise<VlmResponse> {
    // Implement your captioning logic
    return {
      text: 'Generated caption',
      tokensUsed: 100,
      model: this.config.model,
    };
  }
}

// Register the provider
VlmProviderRegistry.register('custom', MyCustomProvider);
```

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Build for production
npm run build

# Run production build
npm start
```

## License

MIT

---

Built with 🕷️ by the Venom team

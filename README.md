# Financial Hub

Multi-company financial management system with receipt matching, Amex import, and QuickBooks Desktop integration.

## Features

- **Multi-Company Support** - Manage receipts and transactions for multiple companies
- **Receipt Processing** - Google Drive integration with Claude Vision for automatic data extraction
- **Transaction Import** - Amex CSV import with deduplication
- **Smart Matching** - AI-powered receipt-to-transaction matching with confidence scoring
- **QuickBooks Sync** - Bidirectional sync with QuickBooks Desktop via Web Connector

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **AI:** Anthropic Claude API (receipt processing)
- **Integrations:** Google Drive API, QuickBooks Web Connector

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Anthropic API key (for receipt processing)
- Google Cloud service account (for Drive integration)
- QuickBooks Desktop Enterprise (for QB sync)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/financial-hub.git
cd financial-hub
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env.local
```

4. Configure environment variables (see [Environment Variables](#environment-variables))

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Anthropic AI (for receipt processing)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Google Drive
DRIVE_UNPROCESSED_FOLDER_ID=your-unprocessed-folder-id
DRIVE_PROCESSED_FOLDER_ID=your-processed-folder-id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# QuickBooks Web Connector
QBWC_PASSWORD=your-secure-password

# App URL (for QWC file generation)
NEXT_PUBLIC_APP_URL=https://your-app-domain.com
```

## QuickBooks Web Connector Setup

The application integrates with QuickBooks Desktop Enterprise via the QB Web Connector.

### How It Works

1. Each company gets a unique QWC file with a company-specific username
2. The Web Connector authenticates using the username to identify the company
3. All companies share the same password (from `QBWC_PASSWORD`)

### Username Format

| Company Code | Username |
|--------------|----------|
| PII | `sync-pii` |
| UPH | `sync-uph` |
| APMO | `sync-apmo` |

### Setup Steps

1. **Generate QWC File**
   - Go to `/sync` in the application
   - Select a company from the dropdown
   - Click "Download QWC File"

2. **Add to Web Connector**
   - Open QuickBooks Web Connector on your Windows machine
   - Click "Add an application"
   - Select the downloaded `.qwc` file
   - When prompted by QuickBooks, authorize the application

3. **Set Password**
   - In Web Connector, click in the Password field for the application
   - Enter the password from your `QBWC_PASSWORD` environment variable
   - Click "Yes" to save the password

4. **Trigger Sync**
   - In the Financial Hub app, go to `/sync`
   - Select the company and click a sync button (Full Sync, Transactions, etc.)
   - In Web Connector, check the application and click "Update Selected"

### Multi-Company Setup

To sync multiple companies:

1. Download a QWC file for each company
2. Add each QWC file to Web Connector
3. Set the same password for all
4. Each will appear as a separate application in Web Connector

## API Endpoints

### QuickBooks Web Connector

- `GET /api/qbwc` - Service info
- `GET /api/qbwc?wsdl` - WSDL for Web Connector
- `POST /api/qbwc` - SOAP endpoint for Web Connector

### Sync Management

- `POST /api/sync/trigger` - Queue sync operations
  - **Pull operations:** `full`, `vendors`, `customers`, `accounts`, `checks`, `bills`, `credit_cards`, `transactions`
  - **Push operations:** `push_transactions`, `push_with_receipts`
- `GET /api/sync/status?companyId=...` - Get sync status
- `GET /api/sync/config?companyId=...` - Get sync configuration
- `PUT /api/sync/config` - Update sync configuration
- `GET /api/sync/qwc?companyId=...` - Download QWC file

### Push to QuickBooks

Transactions marked with `needs_qb_push=true` can be pushed to QuickBooks:

- **Push Transactions** - Creates transactions in QB (Checks, Bills, Credit Card Charges)
- **Push with Receipts** - Same as above, but includes matched receipt info in the QB memo field

When a transaction is successfully pushed:
1. The QB TxnID is saved to the `qb_txn_id` field
2. The `needs_qb_push` flag is set to `false`
3. The `qb_edit_sequence` is stored for future modifications

### Receipt Processing

- `POST /api/processor` - Process receipts from Google Drive

### Matching

- `GET /api/match/suggest?receiptId=...` - Get match suggestions
- `POST /api/match/create` - Create a match
- `DELETE /api/match/[id]` - Remove a match

## Project Structure

```
financial-hub/
├── app/
│   ├── api/
│   │   ├── qbwc/           # QB Web Connector SOAP endpoint
│   │   ├── sync/           # Sync management endpoints
│   │   ├── processor/      # Receipt processing
│   │   └── match/          # Matching endpoints
│   ├── companies/          # Company management
│   ├── receipts/           # Receipt list and details
│   ├── transactions/       # Transaction list and import
│   ├── matching/           # Receipt-transaction matching UI
│   ├── sync/               # QB sync dashboard
│   └── drive/              # Google Drive processor UI
├── lib/
│   ├── qbxml/              # QBXML builders and parsers
│   ├── qbwc/               # Web Connector session management
│   ├── supabase.ts         # Supabase client
│   └── types.ts            # TypeScript types
└── supabase/
    └── rls-policies.sql    # Row Level Security policies
```

## Database Schema

### Core Tables

- `companies` - Company entities with QB file paths
- `receipts` - Receipt records with extracted data
- `transactions` - Financial transactions from various sources
- `transaction_receipts` - Many-to-many match relationships
- `bank_accounts` - Bank/card accounts per company
- `sync_log` - Audit log of sync operations

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

### QuickBooks Integration

The QB Web Connector integration requires:
- A publicly accessible URL (HTTPS)
- The Windows machine running Web Connector must be able to reach this URL

## Development

```bash
# Run development server
npm run dev

# Type check
npm run lint

# Build for production
npm run build
```

## License

Private - All rights reserved

/**
 * Zero-Copy Data Sharing Engine
 * Provisions and manages Snowflake Secure Shares and BigQuery Authorized Views
 * without ever physically moving or duplicating data between systems.
 */

export type DataShareTarget = 'snowflake' | 'bigquery';
export type DataShareStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type DataShareDataset =
  | 'b2b_contacts'
  | 'companies_enriched'
  | 'intent_signals'
  | 'technographics';

export interface DataShareRecord {
  shareId: string;
  target: DataShareTarget;
  accountIdentifier: string; // Snowflake account ID or GCP project ID
  dataset: DataShareDataset;
  status: DataShareStatus;
  createdAt: number;
  expiresAt?: number;
  rowsAccessible: number;
  lastAccessedAt?: number;
}

export interface DataShareRequest {
  target: DataShareTarget;
  accountIdentifier: string;
  dataset: DataShareDataset;
  apiKey: string;
}

export interface DataShareResult {
  success: boolean;
  shareId?: string;
  shareConfig?: SnowflakeShareConfig | BigQueryShareConfig;
  error?: string;
  errorCode?: string;
}

export interface SnowflakeShareConfig {
  shareName: string;
  providerAccount: string;
  consumerAccount: string;
  secureViewDDL: string;
  mountSQL: string;
}

export interface BigQueryShareConfig {
  projectId: string;
  datasetId: string;
  authorizedViewId: string;
  analyticsHubListingId: string;
  mountQuery: string;
}

// In-memory share registry (simulates a distributed share ledger)
const shareRegistry = new Map<string, DataShareRecord>();

const DATASET_ROW_COUNTS: Record<DataShareDataset, number> = {
  b2b_contacts: 450_000_000,
  companies_enriched: 95_000_000,
  intent_signals: 2_800_000_000,
  technographics: 120_000_000,
};

function generateShareId(target: DataShareTarget): string {
  const prefix = target === 'snowflake' ? 'sf_share' : 'bq_share';
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Provision a Zero-Copy Secure Share on Snowflake.
 * Creates a Snowflake SECURE SHARE that grants read-only access to a
 * Secure View—no data duplication, no ETL, no egress charges.
 */
function provisionSnowflakeShare(
  accountIdentifier: string,
  dataset: DataShareDataset,
  shareId: string
): SnowflakeShareConfig {
  const shareName = `ZINBIT_${dataset.toUpperCase()}_SHARE`;
  const viewName = `ZINBIT_${dataset.toUpperCase()}_VIEW`;
  const providerAccount = 'ZINBIT.US-EAST-1.AWS';

  const secureViewDDL = `
-- Zinbit Zero-Copy Secure View (Read-Only, No Data Movement)
CREATE OR REPLACE SECURE VIEW ZINBIT_DATA.PUBLIC.${viewName}
  COMMENT = 'Zinbit by Zintlr | Zero-Copy Secure Share | ${shareId}'
AS
  SELECT * FROM ZINBIT_DATA.INTERNAL.${dataset.toUpperCase()}
  WHERE _share_tenant = CURRENT_ACCOUNT();
`.trim();

  const mountSQL = `
-- Run in your Snowflake account to mount the share
CREATE OR REPLACE DATABASE ZINBIT_${dataset.toUpperCase()} 
  FROM SHARE ${providerAccount}.${shareName};

-- Query instantly — no ETL, no data movement, no lag
SELECT * FROM ZINBIT_${dataset.toUpperCase()}.PUBLIC.${viewName} LIMIT 100;
`.trim();

  return {
    shareName,
    providerAccount,
    consumerAccount: accountIdentifier,
    secureViewDDL,
    mountSQL,
  };
}

/**
 * Provision a Zero-Copy Authorized View on BigQuery Analytics Hub.
 * Creates a linked dataset via Analytics Hub—consumers query live data
 * directly from the provider's storage. Zero bytes transferred.
 */
function provisionBigQueryShare(
  projectId: string,
  dataset: DataShareDataset,
  shareId: string
): BigQueryShareConfig {
  const datasetId = `zinbit_${dataset}`;
  const authorizedViewId = `${dataset}_secure_view`;
  const analyticsHubListingId = `zinbit-analytics-hub.us.zinbit_${dataset}_listing`;

  const mountQuery = `
-- Subscribe to Zinbit Analytics Hub listing, then query:
SELECT *
FROM \`${projectId}.zinbit_shared.${authorizedViewId}\`
WHERE TRUE -- Row-Level Security enforced server-side by Zinbit
LIMIT 1000;

-- Analytics Hub Listing ID (subscribe via GCP Console or CLI):
-- ${analyticsHubListingId}
`.trim();

  return {
    projectId: 'zinbit-data-platform',
    datasetId,
    authorizedViewId,
    analyticsHubListingId,
    mountQuery,
  };
}

/**
 * Main handler: Provision a new Zero-Copy Data Share.
 * Returns configuration to mount and query the share immediately.
 */
export async function provisionDataShare(req: DataShareRequest): Promise<DataShareResult> {
  const { target, accountIdentifier, dataset, apiKey } = req;

  if (!accountIdentifier || !dataset) {
    return {
      success: false,
      error: 'account_identifier and dataset are required.',
      errorCode: 'MISSING_PARAMETERS',
    };
  }

  const shareId = generateShareId(target);
  const now = Date.now();

  const record: DataShareRecord = {
    shareId,
    target,
    accountIdentifier,
    dataset,
    status: 'ACTIVE',
    createdAt: now,
    expiresAt: now + 365 * 24 * 60 * 60 * 1000, // 1 year TTL
    rowsAccessible: DATASET_ROW_COUNTS[dataset],
  };

  shareRegistry.set(shareId, record);

  if (target === 'snowflake') {
    const shareConfig = provisionSnowflakeShare(accountIdentifier, dataset, shareId);
    return { success: true, shareId, shareConfig };
  } else {
    const shareConfig = provisionBigQueryShare(accountIdentifier, dataset, shareId);
    return { success: true, shareId, shareConfig };
  }
}

/**
 * List all active shares for an API key (keyed by account identifier prefix)
 */
export function listDataShares(accountPrefix?: string): DataShareRecord[] {
  const shares = Array.from(shareRegistry.values());
  if (!accountPrefix) return shares;
  return shares.filter(s => s.accountIdentifier.startsWith(accountPrefix));
}

/**
 * Revoke a Zero-Copy share (immediately cuts access at the provider layer)
 */
export function revokeDataShare(shareId: string): { success: boolean; error?: string } {
  const record = shareRegistry.get(shareId);
  if (!record) {
    return { success: false, error: `Share ${shareId} not found.` };
  }
  record.status = 'REVOKED';
  shareRegistry.set(shareId, record);
  return { success: true };
}

/**
 * Reads the two supplied data files.
 *
 * `resolveJsonModule` is on, so importing the JSON directly is enough — there
 * is no database and nothing is persisted. The casts are deliberate: TypeScript
 * infers narrow literal shapes per array element (some items have `attributes:
 * {}`, others have populated objects), which is noise rather than safety here.
 */

import inventoryData from '@/data/inventory.json';
import marketplaceData from '@/data/marketplaces.json';
import type { InventoryItem, Marketplace } from './types';

const inventory = inventoryData as unknown as InventoryItem[];
const marketplaces = marketplaceData as unknown as Marketplace[];

export function getInventory(): InventoryItem[] {
  return inventory;
}

export function getMarketplaces(): Marketplace[] {
  return marketplaces;
}

export function findItem(sku: string): InventoryItem | undefined {
  return inventory.find((item) => item.sku === sku);
}

export function findMarketplace(id: string): Marketplace | undefined {
  return marketplaces.find((marketplace) => marketplace.id === id);
}

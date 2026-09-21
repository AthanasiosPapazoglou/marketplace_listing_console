import Workbench from './workbench';
import { getInventory, getMarketplaces } from '@/lib/data';

/**
 * Server Component: reads the two data files and hands them to the client
 * workbench as props. No interactivity lives here.
 */
export default function Home() {
  return (
    <Workbench inventory={getInventory()} marketplaces={getMarketplaces()} />
  );
}

//TODO: Remove this comment (Vercel autodeploy test)
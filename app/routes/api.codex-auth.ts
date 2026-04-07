import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { getCodexAuthStatus, runCodexAuthAction } from '~/lib/.server/codex-auth';

export async function loader(_args: LoaderFunctionArgs) {
  const status = await getCodexAuthStatus();
  return json(status);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { action } = await request.json<{ action?: 'login' | 'logout' }>();

    if (action !== 'login' && action !== 'logout') {
      return json({ error: 'Invalid action' }, { status: 400 });
    }

    const status = await runCodexAuthAction(action);

    return json(status);
  } catch (error) {
    return json(
      {
        available: false,
        authenticated: false,
        requiresElectron: true,
        error: error instanceof Error ? error.message : 'Codex auth request failed',
      },
      { status: 500 },
    );
  }
}

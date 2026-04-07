import { createReadableStreamFromReadable } from '@remix-run/node';
import type { ServerBuild } from '@remix-run/node';
import mime from 'mime';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { isDev } from './constants';

function shouldAttemptAssetServe(req: Request, pathname: string) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    return false;
  }

  if (pathname.startsWith('/api/')) {
    return false;
  }

  if (pathname.startsWith('/assets/')) {
    return true;
  }

  return path.extname(pathname).length > 0;
}

export async function loadServerBuild(): Promise<any> {
  if (isDev) {
    console.log('Dev mode: server build not loaded');
    return;
  }

  const serverBuildPath = path.join(app.getAppPath(), 'build', 'server', 'index.js');
  console.log(`Loading server build... path is ${serverBuildPath}`);

  try {
    const fileUrl = pathToFileURL(serverBuildPath).href;
    const serverBuild: ServerBuild = /** @type {ServerBuild} */ await import(fileUrl);
    console.log('Server build loaded successfully');

    // eslint-disable-next-line consistent-return
    return serverBuild;
  } catch (buildError) {
    console.log('Failed to load server build:', {
      message: (buildError as Error)?.message,
      stack: (buildError as Error)?.stack,
      error: JSON.stringify(buildError, Object.getOwnPropertyNames(buildError as object)),
    });

    return;
  }
}

// serve assets built by vite.
export async function serveAsset(req: Request, assetsPath: string): Promise<Response | undefined> {
  const url = new URL(req.url);
  const pathname = decodeURIComponent(url.pathname);

  if (!shouldAttemptAssetServe(req, pathname)) {
    return;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  const fullPath = path.join(assetsPath, relativePath);

  if (!fullPath.startsWith(assetsPath)) {
    if (isDev) {
      console.log('Path is outside assets directory:', fullPath);
    }

    return;
  }

  const stat = await fs.stat(fullPath).catch(() => undefined);

  if (!stat?.isFile()) {
    return;
  }

  const headers = new Headers();
  const mimeType = mime.getType(fullPath);

  if (mimeType) {
    headers.set('Content-Type', mimeType);
  }

  if (isDev) {
    console.log('Serving asset:', fullPath, 'mime:', mimeType);
  }

  const body = createReadableStreamFromReadable(createReadStream(fullPath));

  // eslint-disable-next-line consistent-return
  return new Response(body, { headers });
}

import { useRouteLoaderData } from 'react-router';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/home';

export const meta: Route.MetaFunction = () => [{ title: 'ARV Intranet' }];

export default function Home() {
  // Home sits behind the root gate, so `me` is always there.
  const me = useRouteLoaderData<typeof rootLoader>('root')?.me;
  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">ARV Intranet</h1>
      {me ? <p className="text-muted-foreground">Signed in as {me.name}.</p> : null}
    </main>
  );
}

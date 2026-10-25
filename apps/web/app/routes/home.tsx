import { Link } from 'react-router';
import type { Route } from './+types/home';

export const meta: Route.MetaFunction = () => [{ title: 'ARV Intranet' }];

export default function Home() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">ARV Intranet</h1>
      <p>
        <Link to="/users" className="underline underline-offset-4">
          Browse users
        </Link>
      </p>
    </main>
  );
}

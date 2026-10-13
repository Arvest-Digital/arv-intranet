import { Link } from 'react-router';
import type { Route } from './+types/home';

export const meta: Route.MetaFunction = () => [{ title: 'ARV Intranet' }];

export default function Home() {
  return (
    <main>
      <h1>ARV Intranet</h1>
      <p>
        <Link to="/users">Browse users</Link>
      </p>
    </main>
  );
}

import type { User } from '@arv/contracts/identity';

export function UserList({ users }: { users: ReadonlyArray<User> }) {
  if (users.length === 0) return <p className="text-muted-foreground">No users yet.</p>;
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b [&>th]:p-2 [&>th]:font-medium">
          <th>Name</th>
          <th>Email</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b [&>td]:p-2">
            <td>{user.name}</td>
            <td>{user.email}</td>
            <td>{user.createdAt.toISOString().slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

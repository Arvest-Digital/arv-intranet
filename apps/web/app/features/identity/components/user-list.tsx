import type { User } from '@arv/contracts/identity';

export function UserList({ users }: { users: ReadonlyArray<User> }) {
  if (users.length === 0) return <p>No users yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            <td>{user.email}</td>
            <td>{user.createdAt.toISOString().slice(0, 10)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

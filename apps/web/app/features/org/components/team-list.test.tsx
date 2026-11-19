import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { TEAM_MESSAGE, type TeamActionResult } from '../team';
import { design, kateryna, olena, platform } from '../test-data';
import { TeamList } from './team-list';

afterEach(cleanup);

function renderWithAction(...answers: TeamActionResult[]) {
  const forms: FormData[] = [];
  const Stub = createRoutesStub([
    {
      path: '/people/teams',
      Component: () => (
        <TeamList
          teams={[
            { ...platform, teamLead: { id: olena.id, fullName: olena.fullName, team: null } },
            design,
          ]}
          records={[olena, { ...kateryna, team: { id: design.id, name: 'Design' } }]}
        />
      ),
      action: async ({ request }) => {
        forms.push(await request.formData());
        return answers[Math.min(forms.length, answers.length) - 1];
      },
    },
  ]);
  render(<Stub initialEntries={['/people/teams']} />);
  return forms;
}

describe('TeamList (AC-19d)', () => {
  it('lists each team with its lead and resource count', async () => {
    renderWithAction();
    const table = await screen.findByRole('table', { name: 'Teams' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('PlatformOlena Kovalenko1'),
      expect.stringContaining('DesignNo lead1'),
    ]);
  });

  it('shows a duplicate name under the new team name', async () => {
    const forms = renderWithAction({
      ok: false,
      kind: 'invalid',
      intent: 'create',
      fieldErrors: { name: TEAM_MESSAGE.duplicate('Platform') },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New team' }));
    await user.type(screen.getByLabelText('New team'), 'platform ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('create');
    expect(forms[0]!.get('name')).toBe('platform ');
    const message = await screen.findByText('A team named “Platform” already exists');
    expect(screen.getByLabelText('New team').getAttribute('aria-describedby')).toBe(message.id);
    expect(screen.getByLabelText('New team').getAttribute('aria-invalid')).toBe('true');
  });

  it('says how many resources are still in a team it could not remove', async () => {
    const forms = renderWithAction({
      ok: false,
      kind: 'error',
      teamId: design.id,
      error: TEAM_MESSAGE.hasMembers('Design', 1),
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Remove Design' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('intent')).toBe('remove');
    expect(forms[0]!.get('teamId')).toBe(design.id);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Can’t remove Design — 1 resource is still in it.',
    );
  });

  it('renames in the row and closes it once saved', async () => {
    const forms = renderWithAction({ ok: true, intent: 'update', teamId: platform.id });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Rename Platform' }));
    const name = screen.getByLabelText('Team name');
    await user.clear(name);
    await user.type(name, 'Platform Core');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(forms).toHaveLength(1));
    expect(forms[0]!.get('teamId')).toBe(platform.id);
    expect(forms[0]!.get('name')).toBe('Platform Core');
    expect(forms[0]!.get('teamLeadId')).toBe(olena.id);
    await waitFor(() => expect(screen.queryByLabelText('Team name')).toBeNull());
  });
});

import type { Team } from '../../api.ts';

export function TeamMultiSelect({
  teams,
  value,
  onChange,
  label = 'Teams',
}: {
  teams: Team[];
  value: string[];
  onChange: (teamIds: string[]) => void;
  label?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select
        className="multi-select"
        aria-label={label}
        multiple
        value={value}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions, (option) => option.value),
          )
        }
      >
        {teams.map((team) => (
          <option value={team.id} key={team.id}>
            {team.name} · {team.key}
          </option>
        ))}
      </select>
      <small>Hold ⌘ or Ctrl to select several teams.</small>
    </label>
  );
}

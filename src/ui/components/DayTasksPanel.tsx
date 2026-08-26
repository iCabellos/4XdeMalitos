import { useMemo } from 'react';
import { deriveDayTasks, pendingTaskCount, type DayTask } from '../../core/dayTasks';
import type { MatchState, PlayerId } from '../../core/types';
import type { HexId } from '../../map/hex';

const STATUS_MARK: Record<DayTask['status'], { icon: string; className: string }> = {
  done: { icon: '✓', className: 'done' },
  pending: { icon: '•', className: 'pending' },
  unavailable: { icon: '–', className: 'locked' },
};

/**
 * What the player can actually do today. A turn offers a dozen legal actions
 * and a new player sees none of them; this lists them, says why each matters,
 * and jumps you to the right place when tapped.
 */
export function DayTasksPanel({
  state,
  viewerId,
  onFocus,
  onTab,
  tick,
}: {
  state: MatchState;
  viewerId: PlayerId;
  onFocus: (hex: HexId) => void;
  onTab: (tab: NonNullable<DayTask['tab']>) => void;
  tick: number;
}) {
  const tasks = useMemo(() => deriveDayTasks(state, viewerId), [state, viewerId, tick]);
  const pending = pendingTaskCount(tasks);

  return (
    <div className="panel">
      <div className="panel-title">
        Dia {state.day} · {pending} {pending === 1 ? 'accion pendiente' : 'acciones pendientes'}
      </div>
      <div className="panel-body">
        <div className="list">
          {tasks.map((task) => {
            const mark = STATUS_MARK[task.status];
            return (
              <button
                key={task.id}
                className={`task ${mark.className}`}
                onClick={() => {
                  if (task.focusHex) onFocus(task.focusHex);
                  if (task.tab) onTab(task.tab);
                }}
              >
                <span className={`task-mark ${mark.className}`}>{mark.icon}</span>
                <span className="grow">
                  <span className="name">{task.label}</span>
                  <span className="sub">{task.hint}</span>
                </span>
                {task.progress && (
                  <span className="tag mono">
                    {Math.round(task.progress.done)}/{Math.round(task.progress.total)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

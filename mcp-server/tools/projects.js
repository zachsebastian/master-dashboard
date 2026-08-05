// Projects tools — all operate on the dashboards.data JSONB blob through
// lib/projects-blob.js so writes are surgical and concurrency-checked.
import { z } from 'zod';
import {
  readBlob,
  mutateBlob,
  findProject,
  findTask,
  shortId,
  todayDate,
} from '../lib/projects-blob.js';

// App palette (projects/js/state.js) — new projects get the next unused color.
const COLORS = [
  '#e05c4b', '#4a9fd4', '#4caf73', '#a07ad4', '#e08a3c',
  '#e06699', '#5ab4b4', '#b4a55a', '#5a7ab4', '#7ab45a',
];

const STATUS = z.enum(['in-progress', 'on-hold', 'completed']);
const PRIORITY = z.enum(['low', 'medium', 'high']);

function summarize(p) {
  const tasks = p.tasks || [];
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    priority: p.priority,
    completion: p.completion ?? 0,
    dueDate: p.dueDate || null,
    tags: p.tags || [],
    rockId: p.rockId || null,
    tasks_total: tasks.length,
    tasks_done: tasks.filter((t) => t.completedInEntry).length,
    open_blockers: (p.blockers || []).filter(
      (b) => typeof b === 'string' || !b.resolved
    ).length,
  };
}

export const tools = [
  {
    name: 'projects_list',
    description:
      'List all projects with summary info (status, priority, completion %, task counts, open blockers). Use projects_get for full detail on one project.',
    schema: { status: STATUS.optional() },
    handler: async (args, { sb, uid }) => {
      const { blob } = await readBlob(sb, uid);
      let projects = blob?.projects || [];
      if (args.status) projects = projects.filter((p) => p.status === args.status);
      return projects.map(summarize);
    },
  },
  {
    name: 'projects_get',
    description:
      'Get one project in full: description, notes, next steps, tags, blockers, all tasks (with completion state) and progress log entries.',
    schema: { id: z.string() },
    handler: async (args, { sb, uid }) => {
      const { blob } = await readBlob(sb, uid);
      return findProject(blob ?? { projects: [] }, args.id);
    },
  },
  {
    name: 'project_save',
    description:
      'Create a project (omit id) or update fields on one (pass id). Only provided fields change. blockers replaces the whole blockers array — strings for simple blockers, or objects {text, taskId?, resolved?} to tie a blocker to a task.',
    schema: {
      id: z.string().optional(),
      name: z.string().optional(),
      status: STATUS.optional(),
      priority: PRIORITY.optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      next_steps: z.string().optional(),
      due_date: z.string().optional().describe('YYYY-MM-DD, empty string clears'),
      tags: z.array(z.string()).optional(),
      blockers: z
        .array(z.union([z.string(), z.object({}).passthrough()]))
        .optional(),
      rock_id: z.string().optional().describe('Rock id from rocks_list, empty string clears'),
    },
    handler: async (args, { sb, uid }) => {
      return mutateBlob(sb, uid, (data) => {
        let p;
        if (args.id) {
          p = findProject(data, args.id);
        } else {
          if (!args.name) throw new Error('name is required when creating a project.');
          const used = new Set(data.projects.map((x) => x.color));
          p = {
            id: shortId(),
            name: args.name,
            color: COLORS.find((c) => !used.has(c)) || COLORS[data.projects.length % COLORS.length],
            status: 'in-progress',
            priority: 'medium',
            completion: 0,
            tags: [],
            dueDate: null,
            description: '',
            entries: [],
            blockers: [],
            tasks: [],
            nextSteps: '',
            notes: '',
          };
          data.projects.push(p);
        }
        if (args.name !== undefined) p.name = args.name;
        if (args.status !== undefined) p.status = args.status;
        if (args.priority !== undefined) p.priority = args.priority;
        if (args.description !== undefined) p.description = args.description;
        if (args.notes !== undefined) p.notes = args.notes;
        if (args.next_steps !== undefined) p.nextSteps = args.next_steps;
        if (args.due_date !== undefined) p.dueDate = args.due_date || null;
        if (args.tags !== undefined) p.tags = args.tags;
        if (args.blockers !== undefined) p.blockers = args.blockers;
        if (args.rock_id !== undefined) p.rockId = args.rock_id || null;
        return summarize(p);
      });
    },
  },
  {
    name: 'project_delete',
    description:
      'Permanently delete a project and all its tasks, entries, and blockers from the blob. Cannot be undone.',
    schema: { id: z.string() },
    handler: async (args, { sb, uid }) => {
      return mutateBlob(sb, uid, (data) => {
        findProject(data, args.id); // throws with a clear message if missing
        data.projects = data.projects.filter((p) => p.id !== args.id);
        if (data.activeProject === args.id) data.activeProject = null;
        return { deleted: args.id };
      });
    },
  },
  {
    name: 'project_task_save',
    description:
      "Add a task to a project (omit task_id), edit its text, mark it complete/incomplete, or move it to another project. To complete a task, pass completed_in_entry with an entry id from projects_get — or 'today' to auto-create a dated log entry. Pass null to un-complete.",
    schema: {
      project_id: z.string(),
      task_id: z.string().optional(),
      text: z.string().optional(),
      completed_in_entry: z
        .string()
        .nullable()
        .optional()
        .describe("entry id, 'today' to auto-create an entry, or null to un-complete"),
      move_to_project_id: z.string().optional(),
    },
    handler: async (args, { sb, uid }) => {
      return mutateBlob(sb, uid, (data) => {
        const project = findProject(data, args.project_id);
        let task;
        if (args.task_id) {
          task = findTask(project, args.task_id);
        } else {
          if (!args.text) throw new Error('text is required when adding a task.');
          task = { id: shortId(), text: args.text, completedInEntry: null };
          if (!project.tasks) project.tasks = [];
          project.tasks.push(task);
        }
        if (args.text !== undefined) task.text = args.text;

        if (args.completed_in_entry !== undefined) {
          if (args.completed_in_entry === null) {
            task.completedInEntry = null;
          } else if (args.completed_in_entry === 'today') {
            const entry = {
              id: shortId(),
              date: todayDate(),
              note: 'Completed via MCP',
              nextSteps: '',
              completion: 0,
              status: project.status || 'in-progress',
            };
            project.entries = [...(project.entries || []), entry];
            task.completedInEntry = entry.id;
          } else {
            const entry = (project.entries || []).find(
              (e) => e.id === args.completed_in_entry
            );
            if (!entry) {
              throw new Error(
                `No entry '${args.completed_in_entry}' in project '${project.name}'. Use projects_get to see entry ids, or pass 'today'.`
              );
            }
            task.completedInEntry = entry.id;
          }
        }

        if (args.move_to_project_id && args.move_to_project_id !== project.id) {
          const target = findProject(data, args.move_to_project_id);
          project.tasks = project.tasks.filter((t) => t.id !== task.id);
          if (!target.tasks) target.tasks = [];
          // Completion entries belong to the old project; a moved task starts open.
          task.completedInEntry = null;
          target.tasks.push(task);
        }
        return task;
      });
    },
  },
  {
    name: 'project_task_delete',
    description: 'Delete a task from a project.',
    schema: { project_id: z.string(), task_id: z.string() },
    handler: async (args, { sb, uid }) => {
      return mutateBlob(sb, uid, (data) => {
        const project = findProject(data, args.project_id);
        findTask(project, args.task_id);
        project.tasks = project.tasks.filter((t) => t.id !== args.task_id);
        return { deleted: args.task_id };
      });
    },
  },
  {
    name: 'project_entry_add',
    description:
      'Add a progress log entry to a project (a dated update with a note and optional next steps). Optionally mark tasks complete in this entry via completed_task_ids.',
    schema: {
      project_id: z.string(),
      date: z.string().optional().describe('YYYY-MM-DD, default today'),
      note: z.string(),
      next_steps: z.string().optional(),
      status: STATUS.optional().describe("also updates the project's status"),
      completed_task_ids: z.array(z.string()).optional(),
    },
    handler: async (args, { sb, uid }) => {
      return mutateBlob(sb, uid, (data) => {
        const project = findProject(data, args.project_id);
        const entry = {
          id: shortId(),
          date: args.date || todayDate(),
          note: args.note,
          nextSteps: args.next_steps || '',
          completion: 0,
          status: args.status || project.status || 'in-progress',
        };
        project.entries = [...(project.entries || []), entry];
        if (args.status) project.status = args.status;
        for (const tid of args.completed_task_ids || []) {
          findTask(project, tid).completedInEntry = entry.id;
        }
        return entry;
      });
    },
  },
];

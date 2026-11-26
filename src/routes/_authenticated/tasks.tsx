import { createFileRoute } from "@tanstack/react-router";
import { createContext, useContext, useMemo, useState } from "react";
import {
  CheckSquare,
  Plus,
  Trash2,
  ArchiveIcon,
  Loader2,
  GripVertical,
  Calendar,
  LayoutGrid,
  List,
  CheckCircle2,
  Clock,
  CalendarDays,
  FolderIcon,
  CalendarOff,
  Pencil,
  Pin,
  PinOff,
  AlarmClock,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  ListPlus,
  X,
} from "lucide-react";
import { useCreateItem, useDeleteItem, useFolders, useItems, useUpdateItem } from "@/hooks/use-lifeos";
import { PRIORITIES, type Item, type ItemUpdate } from "@/lib/lifeos-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { format, isAfter, isBefore, isToday, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
});

type ColumnId = "backlog" | "today" | "done";

function TasksPage() {
  const { data: items = [], isLoading } = useItems();
  const { data: folders = [] } = useFolders();
  const create = useCreateItem();
  const update = useUpdateItem();
  const del = useDeleteItem();

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [folderId, setFolderId] = useState<string>("none");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [pinned, setPinned] = useState(false);
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetColumn, setTargetColumn] = useState<ColumnId>("backlog");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Task Edit State
  const [editingTask, setEditingTask] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editPriority, setEditPriority] = useState<string>("medium");
  const [editFolderId, setEditFolderId] = useState<string>("none");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editPinned, setEditPinned] = useState(false);

  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<ColumnId | null>(null);

  // Top-level tasks fill the board; sub-tasks are shown inside their parent ("task folder").
  const tasks = useMemo(() => items.filter((i) => i.type === "task" && !i.archived && !i.parent_id), [items]);
  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const i of items) {
      if (i.type !== "task" || i.archived || !i.parent_id) continue;
      const list = map.get(i.parent_id) ?? [];
      list.push(i);
      map.set(i.parent_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return map;
  }, [items]);

  // Pinned (urgent) tasks stay in their own column and are sorted to its top.
  const backlogTasks = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.completed) return false;
          if (!t.due_date) return true;
          const due = startOfDay(new Date(t.due_date));
          const today = startOfDay(new Date());
          return isAfter(due, today);
        })
        .sort(sortByDue),
    [tasks]
  );

  const todayTasks = useMemo(
    () =>
      tasks
        .filter((t) => {
          if (t.completed || !t.due_date) return false;
          const due = startOfDay(new Date(t.due_date));
          const today = startOfDay(new Date());
          return isToday(new Date(t.due_date)) || isBefore(due, today);
        })
        .sort(sortByDue),
    [tasks]
  );

  const doneTasks = useMemo(
    () => tasks.filter((t) => t.completed).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
    [tasks]
  );

  const openModal = (col: ColumnId = "backlog") => {
    setTargetColumn(col);
    setTitle("");
    setDue(col === "today" ? format(new Date(), "yyyy-MM-dd") : "");
    setPriority("medium");
    setFolderId("none");
    setStartTime("");
    setEndTime("");
    setPinned(false);
    setIsModalOpen(true);
  };

  const openEditModal = (task: Item) => {
    setEditingTask(task);
    setEditTitle(task.title || "");
    setEditContent(task.content || "");
    setEditDue(task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "");
    setEditPriority(task.priority || "medium");
    setEditFolderId(task.folder_id || "none");
    setEditStartTime(task.start_at ? format(new Date(task.start_at), "HH:mm") : "");
    setEditEndTime(task.end_at ? format(new Date(task.end_at), "HH:mm") : "");
    setEditPinned(task.pinned);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const timeWindow = buildTimeWindow(due, startTime, endTime);
    if ("error" in timeWindow) {
      toast.error(timeWindow.error);
      return;
    }

    let targetDue: string | null = due ? new Date(due).toISOString() : null;
    if (!targetDue && timeWindow.start_at) {
      // A time was picked without a date → schedule it for today.
      targetDue = new Date().toISOString();
    }
    if (targetColumn === "today" && !due) {
      targetDue = new Date().toISOString();
    }

    create.mutate(
      {
        type: "task",
        title: title.trim(),
        priority,
        due_date: targetDue,
        start_at: timeWindow.start_at,
        end_at: timeWindow.end_at,
        pinned,
        folder_id: folderId !== "none" ? folderId : null,
        completed: false,
      },
      {
        onSuccess: () => {
          toast.success("Task created");
        },
      }
    );

    setTitle("");
    setDue("");
    setFolderId("none");
    setStartTime("");
    setEndTime("");
    setPinned(false);
    setIsModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    const timeWindow = buildTimeWindow(editDue, editStartTime, editEndTime);
    if ("error" in timeWindow) {
      toast.error(timeWindow.error);
      return;
    }

    let dueIso: string | null = editDue ? new Date(editDue).toISOString() : null;
    if (!dueIso && timeWindow.start_at) dueIso = new Date().toISOString();

    const patch: ItemUpdate = {
      title: editTitle.trim(),
      content: editContent.trim() || null,
      priority: editPriority,
      due_date: dueIso,
      start_at: timeWindow.start_at,
      end_at: timeWindow.end_at,
      pinned: editPinned,
      folder_id: editFolderId !== "none" ? editFolderId : null,
    };

    update.mutate(
      { id: editingTask.id, patch },
      {
        onSuccess: () => {
          toast.success("Task updated");
          setEditingTask(null);
        },
        onError: (err) => {
          toast.error(err.message || "Failed to update task");
        },
      }
    );
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedItemId(id);
  };

  const handleDragOver = (e: React.DragEvent, columnId: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (activeDropTarget !== columnId) {
      setActiveDropTarget(columnId);
    }
  };

  const handleDragLeave = (e: React.DragEvent, columnId: ColumnId) => {
    e.preventDefault();
    if (activeDropTarget === columnId) {
      setActiveDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, columnId: ColumnId) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("text/plain") || draggedItemId;
    setActiveDropTarget(null);
    setDraggedItemId(null);

    if (!itemId) return;

    const targetItem = tasks.find((t) => t.id === itemId);
    if (!targetItem) return;

    if (columnId === "done") {
      update.mutate({ id: itemId, patch: { completed: true } });
    } else if (columnId === "today") {
      update.mutate({ id: itemId, patch: moveToTodayPatch(targetItem) });
    } else if (columnId === "backlog") {
      update.mutate({
        id: itemId,
        patch: { completed: false, due_date: null, start_at: null, end_at: null },
      });
    }
  };

  /** Completing a task folder also completes its sub-tasks. */
  const toggleTask = (t: Item) => {
    const completed = !t.completed;
    update.mutate({ id: t.id, patch: { completed } });
    if (completed) {
      for (const s of subtasksByParent.get(t.id) ?? []) {
        if (!s.completed) update.mutate({ id: s.id, patch: { completed: true } });
      }
    }
  };

  const archiveTask = (t: Item) => {
    update.mutate({ id: t.id, patch: { archived: true } });
    for (const s of subtasksByParent.get(t.id) ?? []) update.mutate({ id: s.id, patch: { archived: true } });
  };

  const addSubtask = (parent: Item, subTitle: string) =>
    create.mutate(
      { type: "task", title: subTitle, parent_id: parent.id, priority: parent.priority ?? "medium", completed: false },
      { onError: (err) => toast.error(err.message || "Couldn't add sub-task") }
    );

  // ── Task folder wizard ──
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDue, setFolderDue] = useState("");
  const [folderSubtasks, setFolderSubtasks] = useState<string[]>([]);
  const [folderSubInput, setFolderSubInput] = useState("");
  const [folderSaving, setFolderSaving] = useState(false);

  const openFolderDialog = () => {
    setFolderName("");
    setFolderDue("");
    setFolderSubtasks([]);
    setFolderSubInput("");
    setFolderOpen(true);
  };

  const pushFolderSubtask = () => {
    const v = folderSubInput.trim();
    if (!v) return;
    setFolderSubtasks((prev) => [...prev, v]);
    setFolderSubInput("");
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    const pendingInput = folderSubInput.trim();
    const subs = pendingInput ? [...folderSubtasks, pendingInput] : folderSubtasks;
    setFolderSaving(true);
    try {
      const parent = await create.mutateAsync({
        type: "task",
        title: folderName.trim(),
        tags: ["folder"],
        priority: "medium",
        due_date: folderDue ? new Date(folderDue).toISOString() : null,
        completed: false,
      });
      for (const sub of subs) {
        await create.mutateAsync({ type: "task", title: sub, parent_id: parent.id, priority: "medium", completed: false });
      }
      toast.success(subs.length ? `Folder created with ${subs.length} sub-task${subs.length > 1 ? "s" : ""}` : "Task folder created");
      setFolderOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't create the folder");
    } finally {
      setFolderSaving(false);
    }
  };

  const treeValue = {
    subtasksOf: (id: string) => subtasksByParent.get(id) ?? [],
    onToggle: (t: Item) => toggleTask(t),
    onEdit: (t: Item) => openEditModal(t),
    onDelete: (t: Item) => setConfirmDeleteId(t.id),
    onAdd: addSubtask,
  };

  const togglePin = (t: Item) =>
    update.mutate(
      { id: t.id, patch: { pinned: !t.pinned } },
      { onSuccess: () => toast.success(t.pinned ? "Task unpinned" : "Pinned to the top") }
    );

  return (
    <div className="flex flex-col h-[calc(100dvh-48px)] lg:h-dvh overflow-hidden">
      {/* Sticky header — never scrolls */}
      <header className="shrink-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 pt-4 pb-4 sm:pt-6 sm:pb-5 border-b border-border/40">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-lagoon">
            Task Board
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            Organize, prioritize, and track your progress in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            size="sm"
            onClick={() => openModal("backlog")}
            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Task
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={openFolderDialog}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </Button>

          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-soft">
            <Button
              variant={viewMode === "board" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("board")}
              className={cn("h-8 gap-1.5 text-xs font-medium", viewMode === "board" && "bg-lagoon text-cream")}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className={cn("h-8 gap-1.5 text-xs font-medium", viewMode === "list" && "bg-lagoon text-cream")}
            >
              <List className="h-3.5 w-3.5" /> List
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable task area only */}
      <TaskTreeCtx.Provider value={treeValue}>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-96 rounded-2xl border bg-card p-4 animate-skeleton" />
            ))}
          </div>
        ) : viewMode === "board" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <KanbanColumn
              columnId="backlog"
              title="All Tasks"
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              tasks={backlogTasks}
              folders={folders}
              isActiveDrop={activeDropTarget === "backlog"}
              draggedItemId={draggedItemId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onToggle={(t) => toggleTask(t)}
              onDelete={(t) => setConfirmDeleteId(t.id)}
              onArchive={(t) => archiveTask(t)}
              onEdit={openEditModal}
              onTogglePin={togglePin}
              onMoveToToday={(t) => update.mutate({ id: t.id, patch: moveToTodayPatch(t) })}
              onAddTask={() => openModal("backlog")}
            />

            <KanbanColumn
              columnId="today"
              title="Today & Overdue"
              icon={<CalendarDays className="h-4 w-4 text-primary" />}
              tasks={todayTasks}
              folders={folders}
              isActiveDrop={activeDropTarget === "today"}
              draggedItemId={draggedItemId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onToggle={(t) => toggleTask(t)}
              onDelete={(t) => setConfirmDeleteId(t.id)}
              onArchive={(t) => archiveTask(t)}
              onEdit={openEditModal}
              onTogglePin={togglePin}
              onMoveToBacklog={(t) => update.mutate({ id: t.id, patch: { completed: false, due_date: null, start_at: null, end_at: null } })}
              onAddTask={() => openModal("today")}
            />

            <KanbanColumn
              columnId="done"
              title="Done"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
              tasks={doneTasks}
              folders={folders}
              isActiveDrop={activeDropTarget === "done"}
              draggedItemId={draggedItemId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onToggle={(t) => toggleTask(t)}
              onDelete={(t) => setConfirmDeleteId(t.id)}
              onArchive={(t) => archiveTask(t)}
              onEdit={openEditModal}
              onTogglePin={togglePin}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {backlogTasks.length === 0 && todayTasks.length === 0 && doneTasks.length === 0 && (
              <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
                A quiet list. Add your first task above.
              </div>
            )}

            {todayTasks.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-primary flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" /> Today & Overdue ({todayTasks.length})
                </h2>
                <div className="space-y-2">
                  {todayTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      folders={folders}
                      isDragging={draggedItemId === t.id}
                      onDragStart={handleDragStart}
                      onToggle={() => toggleTask(t)}
                      onDelete={() => setConfirmDeleteId(t.id)}
                      onArchive={() => archiveTask(t)}
                      onEdit={() => openEditModal(t)}
                      onTogglePin={() => togglePin(t)}
                    />
                  ))}
                </div>
              </div>
            )}

            {backlogTasks.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-lagoon flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Backlog ({backlogTasks.length})
                </h2>
                <div className="space-y-2">
                  {backlogTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      folders={folders}
                      isDragging={draggedItemId === t.id}
                      onDragStart={handleDragStart}
                      onToggle={() => toggleTask(t)}
                      onDelete={() => setConfirmDeleteId(t.id)}
                      onArchive={() => archiveTask(t)}
                      onEdit={() => openEditModal(t)}
                      onTogglePin={() => togglePin(t)}
                    />
                  ))}
                </div>
              </div>
            )}

            {doneTasks.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Completed ({doneTasks.length})
                </h2>
                <div className="space-y-2">
                  {doneTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      folders={folders}
                      isDragging={draggedItemId === t.id}
                      onDragStart={handleDragStart}
                      onToggle={() => toggleTask(t)}
                      onDelete={() => setConfirmDeleteId(t.id)}
                      onArchive={() => archiveTask(t)}
                      onEdit={() => openEditModal(t)}
                      onTogglePin={() => togglePin(t)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      </TaskTreeCtx.Provider>

      {/* Task Folder Wizard */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl w-[calc(100vw-2rem)] sm:max-w-md p-5 sm:p-6">
          <form onSubmit={createFolder}>
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold text-foreground">New task folder</DialogTitle>
              <p className="text-xs text-muted-foreground">Group related work and tick off sub-tasks one by one.</p>
            </DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="folder-name" className="text-xs font-semibold text-foreground">Folder name</Label>
                <Input
                  id="folder-name"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="e.g. Launch the new website"
                  autoFocus
                  className="h-10 rounded-xl border-input bg-background text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="folder-due" className="text-xs font-semibold text-foreground">Due date (optional)</Label>
                <Input
                  id="folder-due"
                  type="date"
                  value={folderDue}
                  onChange={(e) => setFolderDue(e.target.value)}
                  className="h-9 rounded-xl border-input bg-background text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="folder-sub" className="text-xs font-semibold text-foreground">Sub-tasks</Label>
                {folderSubtasks.length > 0 && (
                  <ul className="space-y-1">
                    {folderSubtasks.map((st, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm">
                        <span className="flex-1 truncate">{st}</span>
                        <button
                          type="button"
                          onClick={() => setFolderSubtasks((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Input
                    id="folder-sub"
                    value={folderSubInput}
                    onChange={(e) => setFolderSubInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        pushFolderSubtask();
                      }
                    }}
                    placeholder="Add a sub-task and press Enter"
                    className="h-9 rounded-xl border-input bg-background text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={pushFolderSubtask} className="h-9 rounded-xl">
                    Add
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">You can add more later from the folder card.</p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFolderOpen(false)} className="h-9 rounded-xl text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!folderName.trim() || folderSaving} className="h-9 rounded-xl px-4 text-xs font-semibold">
                {folderSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="mr-1 h-3.5 w-3.5" />}
                Create folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Task Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl sm:max-w-md p-6">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold text-foreground">
                {targetColumn === "today" ? "Add Task to Today's Focus" : "Add New Task"}
              </DialogTitle>
            </DialogHeader>
            <div className="py-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title" className="text-xs font-semibold text-foreground">Task Title</Label>
                <Input
                  id="task-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs doing? (e.g. Finish project roadmap)"
                  autoFocus
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 text-sm h-10 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-due" className="text-xs font-semibold text-foreground">Due Date</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                    className="border-input bg-background text-foreground text-xs h-9 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-priority" className="text-xs font-semibold text-foreground">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="task-priority" className="border-input bg-background text-foreground text-xs h-9 rounded-xl">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground border-border">
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <TimeWindowFields
                idPrefix="task"
                start={startTime}
                end={endTime}
                onStartChange={setStartTime}
                onEndChange={setEndTime}
              />

              <PinToggle checked={pinned} onChange={setPinned} />

              {folders.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-folder" className="text-xs font-semibold text-foreground">Folder / Project</Label>
                  <Select value={folderId} onValueChange={setFolderId}>
                    <SelectTrigger id="task-folder" className="border-input bg-background text-foreground text-xs h-9 rounded-xl">
                      <SelectValue placeholder="No Folder" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground border-border">
                      <SelectItem value="none">No Folder</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)} className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground text-xs rounded-xl h-9">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={create.isPending || !title.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-xl h-9 px-4 shadow-sm">
                {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={editingTask !== null} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="border border-border bg-card text-card-foreground shadow-2xl rounded-2xl sm:max-w-md p-6">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" /> Edit Task
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-title" className="text-xs font-semibold text-foreground">Task Title</Label>
                <Input
                  id="edit-task-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Task title"
                  className="border-input bg-background text-foreground text-sm h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-task-content" className="text-xs font-semibold text-foreground">Description / Notes</Label>
                <Textarea
                  id="edit-task-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Add details, sub-notes, or links (optional)..."
                  className="border-input bg-background text-foreground text-xs rounded-xl min-h-[70px] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-task-due" className="text-xs font-semibold text-foreground">Due Date</Label>
                  <Input
                    id="edit-task-due"
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    className="border-input bg-background text-foreground text-xs h-9 rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-task-priority" className="text-xs font-semibold text-foreground">Priority</Label>
                  <Select value={editPriority} onValueChange={setEditPriority}>
                    <SelectTrigger id="edit-task-priority" className="border-input bg-background text-foreground text-xs h-9 rounded-xl">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground border-border">
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <TimeWindowFields
                idPrefix="edit-task"
                start={editStartTime}
                end={editEndTime}
                onStartChange={setEditStartTime}
                onEndChange={setEditEndTime}
              />

              <PinToggle checked={editPinned} onChange={setEditPinned} />

              {folders.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-task-folder" className="text-xs font-semibold text-foreground">Folder / Project</Label>
                  <Select value={editFolderId} onValueChange={setEditFolderId}>
                    <SelectTrigger id="edit-task-folder" className="border-input bg-background text-foreground text-xs h-9 rounded-xl">
                      <SelectValue placeholder="No Folder" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover text-popover-foreground border-border">
                      <SelectItem value="none">No Folder</SelectItem>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTask(null)} className="border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground text-xs rounded-xl h-9">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={update.isPending || !editTitle.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold rounded-xl h-9 px-4 shadow-sm">
                {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
        title="Delete this task?"
        description={
          confirmDeleteId && (subtasksByParent.get(confirmDeleteId)?.length ?? 0) > 0
            ? `This folder and its ${subtasksByParent.get(confirmDeleteId)!.length} sub-task(s) will be permanently deleted.`
            : "This task will be permanently deleted. This action cannot be undone."
        }
        confirmLabel="Delete Task"
        onConfirm={() => {
          if (confirmDeleteId) {
            del.mutate(confirmDeleteId);
            setConfirmDeleteId(null);
          }
        }}
      />
    </div>
  );
}

type TaskTree = {
  subtasksOf: (id: string) => Item[];
  onToggle: (t: Item) => void;
  onEdit: (t: Item) => void;
  onDelete: (t: Item) => void;
  onAdd: (parent: Item, title: string) => void;
};

const TaskTreeCtx = createContext<TaskTree | null>(null);

interface KanbanColumnProps {
  columnId: ColumnId;
  title: string;
  icon: React.ReactNode;
  tasks: Item[];
  folders: Array<{ id: string; name: string }>;
  isActiveDrop: boolean;
  draggedItemId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, columnId: ColumnId) => void;
  onDragLeave: (e: React.DragEvent, columnId: ColumnId) => void;
  onDrop: (e: React.DragEvent, columnId: ColumnId) => void;
  onToggle: (task: Item) => void;
  onDelete: (task: Item) => void;
  onArchive: (task: Item) => void;
  onEdit: (task: Item) => void;
  onTogglePin: (task: Item) => void;
  onMoveToToday?: (task: Item) => void;
  onMoveToBacklog?: (task: Item) => void;
  onAddTask?: () => void;
}

function KanbanColumn({
  columnId,
  title,
  icon,
  tasks,
  folders,
  isActiveDrop,
  draggedItemId,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onToggle,
  onDelete,
  onArchive,
  onEdit,
  onTogglePin,
  onMoveToToday,
  onMoveToBacklog,
  onAddTask,
}: KanbanColumnProps) {
  return (
    <div
      onDragOver={(e) => onDragOver(e, columnId)}
      onDragLeave={(e) => onDragLeave(e, columnId)}
      onDrop={(e) => onDrop(e, columnId)}
      className={cn(
        "flex flex-col rounded-2xl border bg-card/60 p-4 transition-all min-h-[420px]",
        isActiveDrop && "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-lg"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {tasks.length}
          </span>
          {onAddTask && (
            <button
              onClick={onAddTask}
              className="grid h-6 w-6 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-muted-foreground transition hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm"
              title={`Add task to ${title}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2.5">
        {tasks.length === 0 ? (
          <div
            className={cn(
              "flex h-32 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground transition",
              isActiveDrop ? "border-primary text-primary font-medium bg-primary/5" : "border-border"
            )}
          >
            {isActiveDrop ? "Drop task here" : "No tasks here"}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              folders={folders}
              isDragging={draggedItemId === task.id}
              onDragStart={onDragStart}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task)}
              onArchive={() => onArchive(task)}
              onEdit={() => onEdit(task)}
              onTogglePin={() => onTogglePin(task)}
              onMoveToToday={onMoveToToday ? () => onMoveToToday(task) : undefined}
              onMoveToBacklog={onMoveToBacklog ? () => onMoveToBacklog(task) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TaskCardProps {
  task: Item;
  folders: Array<{ id: string; name: string }>;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onMoveToToday?: () => void;
  onMoveToBacklog?: () => void;
}

function TaskCard({
  task,
  folders,
  isDragging,
  onDragStart,
  onToggle,
  onDelete,
  onArchive,
  onEdit,
  onTogglePin,
  onMoveToToday,
  onMoveToBacklog,
}: TaskCardProps) {
  const tree = useContext(TaskTreeCtx);
  const subtasks = tree?.subtasksOf(task.id) ?? [];
  const isFolder = (task.tags ?? []).includes("folder") || subtasks.length > 0;
  const doneCount = subtasks.filter((s) => s.completed).length;
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState("");

  const submitSub = () => {
    const v = newSub.trim();
    if (!v || !tree) return;
    tree.onAdd(task, v);
    setNewSub("");
    setExpanded(true);
  };

  const folder = folders.find((f) => f.id === task.folder_id);
  const overdue =
    task.due_date &&
    !task.completed &&
    isBefore(startOfDay(new Date(task.due_date)), startOfDay(new Date()));

  return (
    <div
      draggable={!adding}
      onDragStart={(e) => onDragStart(e, task.id)}
      className={cn(
        "group relative rounded-xl border bg-card p-2.5 sm:p-3 shadow-soft transition hover:shadow-md cursor-grab active:cursor-grabbing select-none",
        task.completed && "opacity-60 bg-muted/30",
        task.pinned && !task.completed && "border-amber-400/50 bg-amber-400/[0.06] ring-1 ring-amber-400/20",
        isDragging && "opacity-40 border-dashed border-primary"
      )}
    >
      <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition">
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      <Checkbox checked={task.completed} onCheckedChange={onToggle} className="mt-0.5 h-3.5 w-3.5" />

      <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
        <p className={cn("flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-foreground leading-snug hover:text-primary transition", task.completed && "line-through text-muted-foreground")}>
          {isFolder && <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />}
          <span className="min-w-0">{task.title}</span>
        </p>

        {task.content && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            {task.content}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          {task.pinned && !task.completed && (
            <span className="flex items-center gap-1 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Pin className="h-2.5 w-2.5 fill-current" /> Pinned
            </span>
          )}

          {isFolder && subtasks.length > 0 && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                doneCount === subtasks.length ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
              )}
            >
              {doneCount}/{subtasks.length} done
            </span>
          )}

          {task.priority && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wider text-[9px]",
                task.priority === "high" && "bg-destructive/15 text-destructive",
                task.priority === "medium" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                task.priority === "low" && "bg-muted text-muted-foreground"
              )}
            >
              {task.priority}
            </span>
          )}

          {folder && (
            <span className="flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-secondary-foreground text-[9px]">
              <FolderIcon className="h-2.5 w-2.5" /> {folder.name}
            </span>
          )}

          {task.due_date && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px]",
                overdue
                  ? "bg-destructive/15 text-destructive font-medium"
                  : isToday(new Date(task.due_date))
                  ? "bg-primary/15 text-primary font-medium"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Calendar className="h-2.5 w-2.5" />
              {isToday(new Date(task.due_date)) ? "Today" : format(new Date(task.due_date), "MMM d")}
            </span>
          )}

          {task.start_at && (
            <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-700 dark:text-sky-300">
              <AlarmClock className="h-2.5 w-2.5" />
              {format(new Date(task.start_at), "HH:mm")}
              {task.end_at && ` – ${format(new Date(task.end_at), "HH:mm")}`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center opacity-100 sm:opacity-0 transition-opacity sm:group-hover:opacity-100 shrink-0 gap-0.5">
        {!task.completed && (
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            className={cn(
              "rounded p-1 transition",
              task.pinned
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
            )}
            title={task.pinned ? "Unpin task" : "Pin as urgent (show first)"}
          >
            {task.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
        )}
        {!task.completed && (
          <button
            onClick={(e) => { e.stopPropagation(); setAdding(true); setExpanded(true); }}
            className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
            title="Add sub-task"
          >
            <ListPlus className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
          title="Edit Task"
        >
          <Pencil className="h-3 w-3" />
        </button>
        {onMoveToToday && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToToday(); }}
            className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
            title="Move to Today's Focus"
          >
            <CalendarDays className="h-3 w-3" />
          </button>
        )}
        {onMoveToBacklog && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToBacklog(); }}
            className="rounded p-1 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition"
            title="Move back to All Tasks"
          >
            <CalendarOff className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={onArchive}
          className="rounded p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          title="Archive"
        >
          <ArchiveIcon className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      </div>

      {(isFolder || adding) && (
        <div className="mt-2 border-t border-border/60 pt-2 sm:ml-[38px]" onClick={(e) => e.stopPropagation()}>
          {subtasks.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {subtasks.length} sub-task{subtasks.length === 1 ? "" : "s"}
            </button>
          )}
          {subtasks.length > 0 && (
            <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / subtasks.length) * 100}%` }} />
            </div>
          )}
          {expanded && subtasks.length > 0 && (
            <ul className="space-y-0.5">
              {subtasks.map((st) => (
                <li key={st.id} className="group/sub flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/50">
                  <Checkbox checked={st.completed} onCheckedChange={() => tree?.onToggle(st)} className="h-3.5 w-3.5" />
                  <button
                    type="button"
                    onClick={() => tree?.onEdit(st)}
                    className={cn("min-w-0 flex-1 truncate text-left text-xs text-foreground hover:text-primary", st.completed && "text-muted-foreground line-through")}
                  >
                    {st.title}
                  </button>
                  {st.due_date && (
                    <span className="shrink-0 text-[9px] text-muted-foreground">
                      {isToday(new Date(st.due_date)) ? "Today" : format(new Date(st.due_date), "MMM d")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => tree?.onDelete(st)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover/sub:opacity-100"
                    title="Delete sub-task"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!task.completed && (adding || expanded) && (
            <form
              onSubmit={(e) => { e.preventDefault(); submitSub(); }}
              className="mt-1 flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onFocus={() => setAdding(true)}
                onBlur={() => { if (!newSub.trim()) setAdding(false); }}
                onKeyDown={(e) => { if (e.key === "Escape") { setNewSub(""); setAdding(false); (e.target as HTMLInputElement).blur(); } }}
                autoFocus={adding && subtasks.length === 0}
                placeholder="Add a sub-task…"
                className="h-7 min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}


function sortByDue(a: Item, b: Item) {
  // Pinned (urgent) tasks always come first.
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aKey = a.start_at ?? a.due_date;
  const bKey = b.start_at ?? b.due_date;
  if (!aKey && !bKey) return 0;
  if (!aKey) return 1;
  if (!bKey) return -1;
  return aKey < bKey ? -1 : 1;
}

/** Move a task to today, keeping its time-of-day window (if any). */
function moveToTodayPatch(t: Item): ItemUpdate {
  const shift = (iso: string | null) => {
    if (!iso) return null;
    const src = new Date(iso);
    const d = new Date();
    d.setHours(src.getHours(), src.getMinutes(), 0, 0);
    return d.toISOString();
  };
  return {
    completed: false,
    due_date: new Date().toISOString(),
    start_at: shift(t.start_at),
    end_at: shift(t.end_at),
  };
}

/**
 * Combine a yyyy-MM-dd date (or today) with HH:mm start / end times.
 * Returns ISO timestamps, or an error message when the window is invalid.
 */
function buildTimeWindow(
  date: string,
  start: string,
  end: string
): { start_at: string | null; end_at: string | null } | { error: string } {
  if (!start && !end) return { start_at: null, end_at: null };
  if (!start && end) return { error: "Please add a start time too." };

  const day = date ? date : format(new Date(), "yyyy-MM-dd");
  const startDate = new Date(`${day}T${start}`);
  if (Number.isNaN(startDate.getTime())) return { error: "Invalid start time." };

  if (!end) return { start_at: startDate.toISOString(), end_at: null };

  const endDate = new Date(`${day}T${end}`);
  if (Number.isNaN(endDate.getTime())) return { error: "Invalid end time." };
  if (endDate <= startDate) return { error: "End time must be after the start time." };

  return { start_at: startDate.toISOString(), end_at: endDate.toISOString() };
}

function TimeWindowFields({
  idPrefix,
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  idPrefix: string;
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-start`} className="text-xs font-semibold text-foreground">Start time</Label>
        <Input
          id={`${idPrefix}-start`}
          type="time"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className="border-input bg-background text-foreground text-xs h-9 rounded-xl"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-end`} className="text-xs font-semibold text-foreground">End time</Label>
        <Input
          id={`${idPrefix}-end`}
          type="time"
          value={end}
          min={start || undefined}
          onChange={(e) => onEndChange(e.target.value)}
          className="border-input bg-background text-foreground text-xs h-9 rounded-xl"
        />
      </div>
      {(start || end) && (
        <button
          type="button"
          onClick={() => { onStartChange(""); onEndChange(""); }}
          className="col-span-2 -mt-1 justify-self-start text-[11px] text-muted-foreground hover:text-foreground"
        >
          Clear times
        </button>
      )}
    </div>
  );
}

function PinToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition",
        checked ? "border-amber-400/50 bg-amber-400/10" : "border-input bg-background hover:bg-accent/30"
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="h-4 w-4" />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Pin className={cn("h-3.5 w-3.5", checked ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
          Pin as urgent
        </p>
        <p className="text-[11px] text-muted-foreground">Keeps this task at the top of the first list.</p>
      </div>
    </label>
  );
}

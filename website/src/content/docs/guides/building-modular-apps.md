---
title: "Tutorial: Build a Task Manager"
description: Step-by-step guide to building a modular application with app-shell and feature packages
---

In this tutorial, you'll build a complete **Task Manager** application using StackSolo's modular architecture. By the end, you'll have a working app with:

- User authentication (Firebase)
- A dashboard with live statistics
- A Projects feature for organizing work
- A Tasks feature linked to projects
- Cross-feature communication patterns

**Time to complete:** 45-60 minutes

## Prerequisites

Before starting, make sure you have:

- **Node.js 18+** installed
- **pnpm** installed (`npm install -g pnpm`)
- **StackSolo CLI** (`npm install -g stacksolo`)
- A **Firebase project** with Authentication enabled (we'll set this up)
- Basic familiarity with **Vue 3** and **TypeScript**

---

## Part 1: Create the Shell

### Step 1: Initialize the Project

```bash
# Create a new modular app
stacksolo init --template app-shell --name taskmanager

# Navigate into the project
cd my-app
```

You'll be prompted for:
- **Project name**: `my-app` (or whatever you prefer)
- **npm org scope**: `taskmanager` (packages will be `@taskmanager/shell`, etc.)

### Step 2: Explore the Structure

Your project now has this structure:

```
my-app/
├── packages/
│   ├── shell/                  # Main Vue application
│   │   ├── src/
│   │   │   ├── App.vue
│   │   │   ├── main.ts
│   │   │   ├── core/
│   │   │   │   ├── router/     # Route configuration
│   │   │   │   ├── stores/     # Auth and shell state
│   │   │   │   ├── layouts/    # ShellLayout.vue
│   │   │   │   └── lib/        # Firebase config
│   │   │   └── pages/
│   │   │       └── Login.vue
│   │   └── package.json
│   │
│   ├── shared/                 # Shared components and utilities
│   │   ├── src/
│   │   │   ├── components/     # Button, Card, LoadingSpinner
│   │   │   ├── composables/    # useCurrentUser
│   │   │   └── stores/         # notifications
│   │   └── package.json
│   │
│   └── feature-dashboard/      # Default dashboard feature
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   └── index.ts        # Exports routes
│       └── package.json
│
├── pnpm-workspace.yaml
└── package.json
```

**Key insight:** Each folder in `packages/` is a separate npm package. They communicate through explicit imports like `@taskmanager/shared`.

### Step 3: Configure Firebase

Open `packages/shell/src/core/lib/firebase.ts` and add your Firebase config:

```typescript
// packages/shell/src/core/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

**Don't have a Firebase project yet?**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Go to Authentication → Sign-in method
4. Enable **Email/Password** and **Google** providers
5. Go to Project Settings → Your apps → Add web app
6. Copy the config object

### Step 4: First Run

```bash
# Install all dependencies
pnpm install

# Start the development server
pnpm --filter shell dev
```

Open http://localhost:5173. You should see:

**What you should see:**
- A login page with email/password fields
- A "Sign in with Google" button
- Clean, centered layout

Sign in with your Firebase account. After login, you'll see the dashboard with a sidebar.

### Checkpoint 1

At this point you have:
- [x] Working authentication
- [x] Responsive sidebar layout
- [x] Dashboard page
- [ ] Projects feature (next)
- [ ] Tasks feature (later)

---

## Part 2: Understanding the Architecture

Before adding features, let's understand how the pieces fit together.

### Package Dependencies

```
                    ┌──────────────────┐
                    │      shell       │
                    │  (main app)      │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   shared    │  │  dashboard  │  │  projects   │
   │ (utilities) │  │  (feature)  │  │  (feature)  │
   └─────────────┘  └──────┬──────┘  └──────┬──────┘
            ▲              │                │
            └──────────────┴────────────────┘
                     imports from
```

- **Shell** imports features and mounts their routes
- **Features** import from **shared** for components and utilities
- Features don't import from each other directly (loose coupling)

### How Routes Work

Each feature exports a `routes` array:

```typescript
// packages/feature-dashboard/src/index.ts
export const routes = [
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardPage,
    meta: { title: 'Dashboard', icon: 'home' }
  }
];
```

The shell router imports and spreads these:

```typescript
// packages/shell/src/core/router/index.ts
import { routes as dashboardRoutes } from '@taskmanager/feature-dashboard';

const featureRoutes = [
  ...dashboardRoutes,
  // More features added here automatically
];
```

### How State Works

Each feature has its own Pinia store. Cross-feature state goes in `shared`:

```typescript
// Feature-local state (packages/feature-dashboard/src/stores/dashboard.ts)
export const useDashboardStore = defineStore('dashboard', () => {
  // Only dashboard uses this
});

// Shared state (packages/shared/src/stores/notifications.ts)
export const useNotificationStore = defineStore('notifications', () => {
  // Any feature can use this
});
```

---

## Part 3: Build the Projects Feature

### Step 1: Add the Feature

```bash
stacksolo add feature-module --name projects
```

You'll see output like:

```
Adding feature: Projects
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files to create:
  + packages/feature-projects/

Shell updates:
  + Add @taskmanager/feature-projects to shell dependencies
  + Import routes in shell router

✓ Feature added successfully!

Next steps:
  1. Run: pnpm install
  2. Run: pnpm --filter shell dev
  3. Visit /projects in your app
```

### Step 2: Install and Verify

```bash
pnpm install
pnpm --filter shell dev
```

Navigate to http://localhost:5173/projects. You should see a generic feature page with placeholder content.

### Step 3: Define the Project Type

Create a types file for your project data:

```typescript
// packages/feature-projects/src/types.ts
export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: Date;
  taskCount: number;
}
```

### Step 4: Build the Projects Store

Replace the generated store with real project logic:

```typescript
// packages/feature-projects/src/stores/projects.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project } from '../types';

export const useProjectsStore = defineStore('projects', () => {
  // State
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const projectCount = computed(() => projects.value.length);
  const getProjectById = (id: string) =>
    projects.value.find(p => p.id === id);

  // Actions
  async function fetchProjects() {
    loading.value = true;
    error.value = null;

    try {
      // TODO: Replace with real API call
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data for now
      projects.value = [
        {
          id: '1',
          name: 'Website Redesign',
          description: 'Modernize the company website',
          color: '#3B82F6',
          createdAt: new Date(),
          taskCount: 5
        },
        {
          id: '2',
          name: 'Mobile App',
          description: 'Build iOS and Android apps',
          color: '#10B981',
          createdAt: new Date(),
          taskCount: 12
        }
      ];
    } catch (e) {
      error.value = 'Failed to load projects';
    } finally {
      loading.value = false;
    }
  }

  async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'taskCount'>) {
    const newProject: Project = {
      ...data,
      id: Date.now().toString(),
      createdAt: new Date(),
      taskCount: 0
    };

    // TODO: Replace with real API call
    projects.value.push(newProject);
    return newProject;
  }

  async function deleteProject(id: string) {
    // TODO: Replace with real API call
    projects.value = projects.value.filter(p => p.id !== id);
  }

  return {
    projects,
    loading,
    error,
    projectCount,
    getProjectById,
    fetchProjects,
    createProject,
    deleteProject
  };
});
```

### Step 5: Build the Projects Page

Replace the generated page with a real projects list:

```vue
<!-- packages/feature-projects/src/pages/ProjectsPage.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Card, Button, LoadingSpinner } from '@taskmanager/shared';
import { useProjectsStore } from '../stores/projects';
import ProjectCard from '../components/ProjectCard.vue';
import CreateProjectModal from '../components/CreateProjectModal.vue';

const store = useProjectsStore();
const showCreateModal = ref(false);

onMounted(() => {
  store.fetchProjects();
});
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Projects</h1>
        <p class="text-gray-500">Manage your projects and track progress</p>
      </div>
      <Button @click="showCreateModal = true">
        + New Project
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="store.loading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Error State -->
    <Card v-else-if="store.error" class="bg-red-50 border-red-200">
      <p class="text-red-600">{{ store.error }}</p>
      <Button variant="secondary" class="mt-2" @click="store.fetchProjects">
        Try Again
      </Button>
    </Card>

    <!-- Empty State -->
    <Card v-else-if="store.projects.length === 0" class="text-center py-12">
      <div class="text-gray-400 mb-4">
        <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-gray-900">No projects yet</h3>
      <p class="text-gray-500 mt-1">Get started by creating your first project.</p>
      <Button class="mt-4" @click="showCreateModal = true">
        Create Project
      </Button>
    </Card>

    <!-- Projects Grid -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <ProjectCard
        v-for="project in store.projects"
        :key="project.id"
        :project="project"
        @delete="store.deleteProject(project.id)"
      />
    </div>

    <!-- Create Modal -->
    <CreateProjectModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @create="store.createProject($event); showCreateModal = false"
    />
  </div>
</template>
```

### Step 6: Create the Project Card Component

```vue
<!-- packages/feature-projects/src/components/ProjectCard.vue -->
<script setup lang="ts">
import { Card } from '@taskmanager/shared';
import type { Project } from '../types';

defineProps<{
  project: Project;
}>();

defineEmits<{
  delete: [];
}>();
</script>

<template>
  <Card class="hover:shadow-md transition-shadow cursor-pointer">
    <div class="flex items-start gap-3">
      <!-- Color indicator -->
      <div
        class="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
        :style="{ backgroundColor: project.color }"
      />

      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-gray-900 truncate">{{ project.name }}</h3>
        <p class="text-sm text-gray-500 mt-1 line-clamp-2">
          {{ project.description }}
        </p>

        <div class="flex items-center gap-4 mt-3 text-sm text-gray-400">
          <span>{{ project.taskCount }} tasks</span>
          <span>{{ new Date(project.createdAt).toLocaleDateString() }}</span>
        </div>
      </div>

      <!-- Actions menu -->
      <button
        class="text-gray-400 hover:text-red-500 p-1"
        @click.stop="$emit('delete')"
        title="Delete project"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </Card>
</template>
```

### Step 7: Create the Modal Component

```vue
<!-- packages/feature-projects/src/components/CreateProjectModal.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@taskmanager/shared';

const emit = defineEmits<{
  close: [];
  create: [data: { name: string; description: string; color: string }];
}>();

const name = ref('');
const description = ref('');
const color = ref('#3B82F6');

const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function handleSubmit() {
  if (!name.value.trim()) return;

  emit('create', {
    name: name.value,
    description: description.value,
    color: color.value
  });
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div class="p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Create Project</h2>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              v-model="name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter project name"
              required
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              v-model="description"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Brief description of the project"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div class="flex gap-2">
              <button
                v-for="c in colors"
                :key="c"
                type="button"
                class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                :class="color === c ? 'border-gray-900 scale-110' : 'border-transparent'"
                :style="{ backgroundColor: c }"
                @click="color = c"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <Button type="button" variant="secondary" class="flex-1" @click="$emit('close')">
              Cancel
            </Button>
            <Button type="submit" class="flex-1">
              Create Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
```

### Step 8: Update the Exports

```typescript
// packages/feature-projects/src/index.ts
import type { RouteRecordRaw } from 'vue-router';
import ProjectsPage from './pages/ProjectsPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/projects',
    name: 'projects',
    component: ProjectsPage,
    meta: {
      title: 'Projects',
      icon: 'folder'
    }
  }
];

// Export for other features to use
export { useProjectsStore } from './stores/projects';
export type { Project } from './types';
```

### Step 9: Test It

```bash
pnpm --filter shell dev
```

Navigate to http://localhost:5173/projects. You should see:
- A header with "Projects" title and "New Project" button
- Two mock projects displayed as cards
- Click "New Project" to open the creation modal
- Created projects appear in the grid
- Delete button removes projects

### Checkpoint 2

At this point you have:
- [x] Working authentication
- [x] Responsive sidebar layout
- [x] Dashboard page
- [x] Projects feature with CRUD
- [ ] Tasks feature (next)
- [ ] Cross-feature stats (later)

---

## Part 4: Build the Tasks Feature

### Step 1: Add the Feature

```bash
stacksolo add feature-module --name tasks
pnpm install
```

### Step 2: Define Task Types

```typescript
// packages/feature-tasks/src/types.ts
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  dueDate?: Date;
}
```

### Step 3: Build the Tasks Store

```typescript
// packages/feature-tasks/src/stores/tasks.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Task } from '../types';

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedProjectId = ref<string | null>(null);

  // Getters
  const taskCount = computed(() => tasks.value.length);

  const tasksByStatus = computed(() => ({
    todo: tasks.value.filter(t => t.status === 'todo'),
    in_progress: tasks.value.filter(t => t.status === 'in_progress'),
    done: tasks.value.filter(t => t.status === 'done')
  }));

  const filteredTasks = computed(() => {
    if (!selectedProjectId.value) return tasks.value;
    return tasks.value.filter(t => t.projectId === selectedProjectId.value);
  });

  const getTasksByProject = (projectId: string) =>
    tasks.value.filter(t => t.projectId === projectId);

  // Actions
  async function fetchTasks() {
    loading.value = true;
    error.value = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      // Mock data
      tasks.value = [
        {
          id: '1',
          projectId: '1',
          title: 'Design homepage mockup',
          description: 'Create wireframes and high-fidelity designs',
          status: 'done',
          priority: 'high',
          createdAt: new Date()
        },
        {
          id: '2',
          projectId: '1',
          title: 'Implement responsive layout',
          description: 'Make sure it works on mobile and tablet',
          status: 'in_progress',
          priority: 'high',
          createdAt: new Date()
        },
        {
          id: '3',
          projectId: '1',
          title: 'Add dark mode support',
          description: 'Implement theme switching',
          status: 'todo',
          priority: 'medium',
          createdAt: new Date()
        },
        {
          id: '4',
          projectId: '2',
          title: 'Set up React Native project',
          description: 'Initialize with Expo',
          status: 'done',
          priority: 'high',
          createdAt: new Date()
        },
        {
          id: '5',
          projectId: '2',
          title: 'Build authentication flow',
          description: 'Login, signup, password reset',
          status: 'in_progress',
          priority: 'high',
          createdAt: new Date()
        }
      ];
    } catch (e) {
      error.value = 'Failed to load tasks';
    } finally {
      loading.value = false;
    }
  }

  async function createTask(data: Omit<Task, 'id' | 'createdAt'>) {
    const newTask: Task = {
      ...data,
      id: Date.now().toString(),
      createdAt: new Date()
    };
    tasks.value.push(newTask);
    return newTask;
  }

  async function updateTaskStatus(id: string, status: Task['status']) {
    const task = tasks.value.find(t => t.id === id);
    if (task) {
      task.status = status;
    }
  }

  async function deleteTask(id: string) {
    tasks.value = tasks.value.filter(t => t.id !== id);
  }

  function setProjectFilter(projectId: string | null) {
    selectedProjectId.value = projectId;
  }

  return {
    tasks,
    loading,
    error,
    taskCount,
    tasksByStatus,
    filteredTasks,
    selectedProjectId,
    getTasksByProject,
    fetchTasks,
    createTask,
    updateTaskStatus,
    deleteTask,
    setProjectFilter
  };
});
```

### Step 4: Build the Tasks Page (Kanban Board)

```vue
<!-- packages/feature-tasks/src/pages/TasksPage.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Card, Button, LoadingSpinner } from '@taskmanager/shared';
import { useTasksStore } from '../stores/tasks';
import { useProjectsStore } from '@taskmanager/feature-projects';
import TaskCard from '../components/TaskCard.vue';
import CreateTaskModal from '../components/CreateTaskModal.vue';

const tasksStore = useTasksStore();
const projectsStore = useProjectsStore();
const showCreateModal = ref(false);

onMounted(() => {
  tasksStore.fetchTasks();
  projectsStore.fetchProjects();
});

const columns = [
  { key: 'todo', title: 'To Do', color: 'bg-gray-100' },
  { key: 'in_progress', title: 'In Progress', color: 'bg-blue-50' },
  { key: 'done', title: 'Done', color: 'bg-green-50' }
] as const;
</script>

<template>
  <div class="p-6 h-full">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Tasks</h1>
        <p class="text-gray-500">Drag tasks between columns to update status</p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Project Filter -->
        <select
          :value="tasksStore.selectedProjectId || ''"
          @change="tasksStore.setProjectFilter(($event.target as HTMLSelectElement).value || null)"
          class="px-3 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">All Projects</option>
          <option
            v-for="project in projectsStore.projects"
            :key="project.id"
            :value="project.id"
          >
            {{ project.name }}
          </option>
        </select>

        <Button @click="showCreateModal = true">
          + New Task
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="tasksStore.loading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Kanban Board -->
    <div v-else class="grid grid-cols-3 gap-4 h-[calc(100vh-200px)]">
      <div
        v-for="column in columns"
        :key="column.key"
        class="flex flex-col rounded-lg overflow-hidden"
        :class="column.color"
      >
        <!-- Column Header -->
        <div class="p-3 font-medium text-gray-700 border-b bg-white/50">
          {{ column.title }}
          <span class="ml-2 text-gray-400">
            ({{ tasksStore.tasksByStatus[column.key].length }})
          </span>
        </div>

        <!-- Tasks -->
        <div class="flex-1 overflow-y-auto p-3 space-y-3">
          <TaskCard
            v-for="task in tasksStore.filteredTasks.filter(t => t.status === column.key)"
            :key="task.id"
            :task="task"
            :project="projectsStore.getProjectById(task.projectId)"
            @update-status="tasksStore.updateTaskStatus(task.id, $event)"
            @delete="tasksStore.deleteTask(task.id)"
          />

          <div
            v-if="tasksStore.filteredTasks.filter(t => t.status === column.key).length === 0"
            class="text-center text-gray-400 py-8 text-sm"
          >
            No tasks
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <CreateTaskModal
      v-if="showCreateModal"
      :projects="projectsStore.projects"
      @close="showCreateModal = false"
      @create="tasksStore.createTask($event); showCreateModal = false"
    />
  </div>
</template>
```

### Step 5: Create the Task Card Component

```vue
<!-- packages/feature-tasks/src/components/TaskCard.vue -->
<script setup lang="ts">
import { Card } from '@taskmanager/shared';
import type { Task } from '../types';
import type { Project } from '@taskmanager/feature-projects';

defineProps<{
  task: Task;
  project?: Project;
}>();

const emit = defineEmits<{
  'update-status': [status: Task['status']];
  delete: [];
}>();

const priorityColors = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700'
};

const statusOptions: { value: Task['status']; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' }
];
</script>

<template>
  <Card class="bg-white hover:shadow-md transition-shadow">
    <!-- Project indicator -->
    <div v-if="project" class="flex items-center gap-2 mb-2">
      <div
        class="w-2 h-2 rounded-full"
        :style="{ backgroundColor: project.color }"
      />
      <span class="text-xs text-gray-500">{{ project.name }}</span>
    </div>

    <!-- Title -->
    <h4 class="font-medium text-gray-900">{{ task.title }}</h4>

    <!-- Description -->
    <p v-if="task.description" class="text-sm text-gray-500 mt-1 line-clamp-2">
      {{ task.description }}
    </p>

    <!-- Footer -->
    <div class="flex items-center justify-between mt-3 pt-3 border-t">
      <span
        class="text-xs px-2 py-1 rounded-full"
        :class="priorityColors[task.priority]"
      >
        {{ task.priority }}
      </span>

      <div class="flex items-center gap-2">
        <!-- Status dropdown -->
        <select
          :value="task.status"
          @change="emit('update-status', ($event.target as HTMLSelectElement).value as Task['status'])"
          class="text-xs border border-gray-200 rounded px-2 py-1"
        >
          <option
            v-for="opt in statusOptions"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>

        <!-- Delete button -->
        <button
          class="text-gray-400 hover:text-red-500"
          @click="emit('delete')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </Card>
</template>
```

### Step 6: Create Task Modal

```vue
<!-- packages/feature-tasks/src/components/CreateTaskModal.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { Button } from '@taskmanager/shared';
import type { Project } from '@taskmanager/feature-projects';
import type { Task } from '../types';

const props = defineProps<{
  projects: Project[];
}>();

const emit = defineEmits<{
  close: [];
  create: [data: Omit<Task, 'id' | 'createdAt'>];
}>();

const title = ref('');
const description = ref('');
const projectId = ref(props.projects[0]?.id || '');
const priority = ref<Task['priority']>('medium');
const status = ref<Task['status']>('todo');

function handleSubmit() {
  if (!title.value.trim() || !projectId.value) return;

  emit('create', {
    title: title.value,
    description: description.value,
    projectId: projectId.value,
    priority: priority.value,
    status: status.value
  });
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div class="p-6">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Create Task</h2>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Project
            </label>
            <select
              v-model="projectId"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              <option v-for="p in projects" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              v-model="title"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="What needs to be done?"
              required
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              v-model="description"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Add details (optional)"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                v-model="priority"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                v-model="status"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <Button type="button" variant="secondary" class="flex-1" @click="$emit('close')">
              Cancel
            </Button>
            <Button type="submit" class="flex-1">
              Create Task
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
```

### Step 7: Update Exports

```typescript
// packages/feature-tasks/src/index.ts
import type { RouteRecordRaw } from 'vue-router';
import TasksPage from './pages/TasksPage.vue';

export const routes: RouteRecordRaw[] = [
  {
    path: '/tasks',
    name: 'tasks',
    component: TasksPage,
    meta: {
      title: 'Tasks',
      icon: 'check-square'
    }
  }
];

export { useTasksStore } from './stores/tasks';
export type { Task } from './types';
```

### Step 8: Test It

```bash
pnpm --filter shell dev
```

Navigate to http://localhost:5173/tasks. You should see:
- A Kanban board with three columns (To Do, In Progress, Done)
- Project filter dropdown
- Tasks organized by status
- Status dropdown on each task card to move between columns
- "New Task" button to create tasks

### Checkpoint 3

At this point you have:
- [x] Working authentication
- [x] Responsive sidebar layout
- [x] Dashboard page
- [x] Projects feature with CRUD
- [x] Tasks feature with Kanban board
- [ ] Cross-feature stats on dashboard (next)

---

## Part 5: Cross-Feature Communication

Now let's make the dashboard show real statistics from our features.

### Step 1: Create a Shared Stats Store

Create a store in the shared package that aggregates data from features:

```typescript
// packages/shared/src/stores/appStats.ts
import { defineStore } from 'pinia';
import { computed } from 'vue';

// Dynamic imports to avoid circular dependencies
export const useAppStatsStore = defineStore('appStats', () => {
  // These will be populated by features when they load
  const getStats = computed(() => {
    // We use dynamic imports through a registry pattern
    const projectsStore = (window as any).__projectsStore;
    const tasksStore = (window as any).__tasksStore;

    return {
      totalProjects: projectsStore?.projects?.length ?? 0,
      totalTasks: tasksStore?.tasks?.length ?? 0,
      completedTasks: tasksStore?.tasks?.filter((t: any) => t.status === 'done').length ?? 0,
      inProgressTasks: tasksStore?.tasks?.filter((t: any) => t.status === 'in_progress').length ?? 0
    };
  });

  return { getStats };
});
```

### Step 2: Register Stores (Alternative Pattern)

A cleaner approach is to use Pinia's built-in store access. Update the dashboard to import directly:

```vue
<!-- packages/feature-dashboard/src/pages/DashboardPage.vue -->
<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { Card, useCurrentUser } from '@taskmanager/shared';
import { useProjectsStore } from '@taskmanager/feature-projects';
import { useTasksStore } from '@taskmanager/feature-tasks';
import StatsCard from '../components/StatsCard.vue';

const user = useCurrentUser();
const projectsStore = useProjectsStore();
const tasksStore = useTasksStore();

onMounted(() => {
  projectsStore.fetchProjects();
  tasksStore.fetchTasks();
});

const stats = computed(() => [
  {
    label: 'Total Projects',
    value: projectsStore.projectCount,
    icon: 'folder',
    color: 'bg-blue-500'
  },
  {
    label: 'Total Tasks',
    value: tasksStore.taskCount,
    icon: 'check-square',
    color: 'bg-purple-500'
  },
  {
    label: 'In Progress',
    value: tasksStore.tasksByStatus.in_progress.length,
    icon: 'clock',
    color: 'bg-yellow-500'
  },
  {
    label: 'Completed',
    value: tasksStore.tasksByStatus.done.length,
    icon: 'check-circle',
    color: 'bg-green-500'
  }
]);

const recentTasks = computed(() =>
  tasksStore.tasks
    .filter(t => t.status !== 'done')
    .slice(0, 5)
);
</script>

<template>
  <div class="p-6">
    <!-- Welcome Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900">
        Welcome back, {{ user?.displayName || 'User' }}
      </h1>
      <p class="text-gray-500">Here's what's happening with your projects.</p>
    </div>

    <!-- Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
      <StatsCard
        v-for="stat in stats"
        :key="stat.label"
        :label="stat.label"
        :value="stat.value"
        :color="stat.color"
      />
    </div>

    <!-- Recent Tasks -->
    <Card>
      <h2 class="text-lg font-semibold text-gray-900 mb-4">Active Tasks</h2>

      <div v-if="recentTasks.length === 0" class="text-gray-500 text-center py-4">
        No active tasks. Create one from the Tasks page.
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="task in recentTasks"
          :key="task.id"
          class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
        >
          <div>
            <p class="font-medium text-gray-900">{{ task.title }}</p>
            <p class="text-sm text-gray-500">
              {{ projectsStore.getProjectById(task.projectId)?.name || 'Unknown Project' }}
            </p>
          </div>
          <span
            class="text-xs px-2 py-1 rounded-full"
            :class="task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
          >
            {{ task.status === 'in_progress' ? 'In Progress' : 'To Do' }}
          </span>
        </div>
      </div>
    </Card>
  </div>
</template>
```

### Step 3: Create the Stats Card Component

```vue
<!-- packages/feature-dashboard/src/components/StatsCard.vue -->
<script setup lang="ts">
import { Card } from '@taskmanager/shared';

defineProps<{
  label: string;
  value: number;
  color: string;
}>();
</script>

<template>
  <Card class="flex items-center gap-4">
    <div
      class="w-12 h-12 rounded-lg flex items-center justify-center text-white"
      :class="color"
    >
      <span class="text-xl font-bold">{{ value }}</span>
    </div>
    <div>
      <p class="text-2xl font-bold text-gray-900">{{ value }}</p>
      <p class="text-sm text-gray-500">{{ label }}</p>
    </div>
  </Card>
</template>
```

### Step 4: Add Feature Dependencies

Update the dashboard's package.json to include the feature dependencies:

```json
// packages/feature-dashboard/package.json
{
  "name": "@taskmanager/feature-dashboard",
  "dependencies": {
    "@taskmanager/shared": "workspace:*",
    "@taskmanager/feature-projects": "workspace:*",
    "@taskmanager/feature-tasks": "workspace:*"
  }
}
```

Then run:

```bash
pnpm install
```

### Step 5: Test the Integration

```bash
pnpm --filter shell dev
```

Navigate to http://localhost:5173/dashboard. You should see:
- Stats cards showing counts from Projects and Tasks
- "Active Tasks" list showing incomplete tasks
- Project names displayed for each task

**Try this:**
1. Go to Projects, create a new project
2. Go back to Dashboard - project count increases
3. Go to Tasks, create a new task
4. Go back to Dashboard - task count increases, task appears in list

### Cross-Feature Best Practices

**Do:**
- Import stores from feature packages when you need their data
- Use computed properties for reactive cross-feature data
- Keep feature boundaries clear (Projects doesn't modify Tasks directly)

**Don't:**
- Create circular dependencies between features
- Directly mutate another feature's state
- Over-couple features (each should work standalone if possible)

---

## Part 6: Final Polish

### Add Navigation Icons

The sidebar uses icons from route meta. Make sure your features have icons:

```typescript
// In each feature's index.ts
export const routes = [
  {
    path: '/projects',
    meta: {
      title: 'Projects',
      icon: 'folder'  // Or use a component
    }
  }
];
```

### Loading States

All pages should handle loading gracefully:

```vue
<div v-if="store.loading" class="flex justify-center py-12">
  <LoadingSpinner />
</div>
<div v-else>
  <!-- Content -->
</div>
```

### Error Handling

Show user-friendly error messages:

```vue
<Card v-if="store.error" class="bg-red-50 border-red-200">
  <p class="text-red-600">{{ store.error }}</p>
  <Button variant="secondary" @click="store.fetch()">
    Try Again
  </Button>
</Card>
```

---

## Part 7: Building for Production

### Step 1: Build All Packages

```bash
pnpm build
```

This builds all packages in the correct order (shared → features → shell).

### Step 2: Preview the Build

```bash
pnpm --filter shell preview
```

Open http://localhost:4173 to see the production build.

### Step 3: Environment Variables

For production, create a `.env.production` file:

```bash
# packages/shell/.env.production
VITE_FIREBASE_API_KEY=your-production-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

Update firebase.ts to use environment variables:

```typescript
// packages/shell/src/core/lib/firebase.ts
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // ...
};
```

---

## Next Steps

Congratulations! You've built a complete modular application. Here's what you can do next:

### Add More Features

```bash
stacksolo add feature-module --name settings
stacksolo add feature-module --name reports
```

### Connect to a Real Backend

Replace the mock data in stores with real API calls:

```typescript
async function fetchProjects() {
  const response = await fetch('/api/projects', {
    headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` }
  });
  projects.value = await response.json();
}
```

### Deploy to Production

If you want to deploy with StackSolo:

```bash
# Add backend API
stacksolo add firebase-auth-api

# Deploy everything
stacksolo deploy
```

### Learn More

- [Micro-Templates Guide](/guides/micro-templates/) - Deep dive on all template types
- [CLI Reference](/reference/cli/) - All available commands
- [Configuration Guide](/guides/configuration/) - Full config options

---

## Summary

In this tutorial, you learned how to:

1. **Create a modular monorepo** with `stacksolo init --template app-shell`
2. **Add feature packages** with `stacksolo add feature-module`
3. **Build real features** with Pinia stores and Vue components
4. **Communicate between features** using shared stores
5. **Structure code** for maintainability and team collaboration

The modular architecture you've built scales from solo projects to large teams, with clear boundaries and explicit dependencies.

# Gantt API access tokens

Managers, general managers, and administrators can open **Profile → API access tokens** and choose the **Gantt** scope. Choose a name, read-only or read-and-write access, and an expiry of 30, 90, or 365 days. The full token appears once. Copy it before choosing **Done**. See the [Newsletter and community API reference](../public/docs/site-api.html) for article and community integrations.

Tokens inherit their owner's current project permissions. Managers access their own and shared projects; general managers and administrators retain access to all projects. Expired or revoked tokens fail immediately. A deleted account or an account downgraded below manager cannot use its tokens. Signing out of the website does not revoke integration tokens.

Token metadata is private to its owner. Only a hash of the secret is stored. Each account can keep up to 20 tokens, including expired tokens; revoke unused ones to free a slot.

## Authentication

Send the token in the `Authorization` header:

```http
Authorization: Bearer <your-token>
```

Use the website's API base URL. On the current MMEMS deployment, the frontend proxy is `http://10.40.240.3:32280` and the direct PocketBase API is `http://10.40.240.3:32290`. Keep tokens out of URLs and request logs; use HTTPS where it is configured.

## Endpoints

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/projects` | List accessible projects, including their Gantt data |
| GET | `/api/projects/tasks` | Fetch all tasks across accessible projects |
| GET | `/api/projects/{projectId}` | Fetch one accessible project |
| GET | `/api/projects/{projectId}/tasks` | Fetch its tasks |
| POST | `/api/projects/{projectId}/tasks` | Add a task |
| PATCH | `/api/projects/{projectId}/tasks/{taskId}` | Update a task |
| PATCH | `/api/projects/{projectId}/tasks/{taskId}/status` | Update task status |
| DELETE | `/api/projects/{projectId}/tasks/{taskId}` | Remove a task and its descendant subtasks |
| GET / POST | `/api/projects/{projectId}/tasks/{taskId}/subtasks` | Fetch / add subtasks |
| GET / POST | `/api/projects/{projectId}/milestones` | Fetch / add milestones |
| GET | `/api/projects/{projectId}/progress` | Check project status and calculated progress |
| PATCH | `/api/projects/{projectId}/progress` | Atomically update task progress and optionally project status |
| PATCH | `/api/projects/{projectId}/status` | Update project status |

Read-only tokens support GET requests. These tokens cannot create projects, change project-sharing permissions, manage tokens, modify accounts, or write newsletters/community posts. Token creation and revocation require a normal signed-in website session.

The all-tasks response contains `items`, `totalItems`, and `projectCount`. Every task includes `projectId` and `projectTitle` alongside its Gantt fields. A task's `id` belongs to its project; always use both identifiers when changing it.

## Fetch all tasks

Set `NEWSLETTER_API_TOKEN` to the token copied from Profile, then run:

```bash
curl -H "Authorization: Bearer $NEWSLETTER_API_TOKEN" \
  'http://10.40.240.3:32280/api/projects/tasks'
```

## Add, update, and remove tasks

A new task can include `name`, `startDate` (`YYYY-MM-DD`), `durationDays`, `status`, `progress`, and `predecessorIds`. An optional `id` must be unique within the project. Status values are `pending`, `in-progress`, `completed`, and `delayed`.

```bash
curl -X POST -H "Authorization: Bearer $NEWSLETTER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Prepare release","startDate":"2026-11-15","durationDays":2,"status":"pending"}' \
  'http://10.40.240.3:32280/api/projects/<projectId>/tasks'
```

```bash
curl -X PATCH -H "Authorization: Bearer $NEWSLETTER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"in-progress","progress":60}' \
  'http://10.40.240.3:32280/api/projects/<projectId>/tasks/<taskId>'
```

```bash
curl -X DELETE -H "Authorization: Bearer $NEWSLETTER_API_TOKEN" \
  'http://10.40.240.3:32280/api/projects/<projectId>/tasks/<taskId>'
```

Task writes preserve the application's Sunday–Thursday workday scheduling, predecessor validation, parent roll-ups, and resource data. Deleting a parent also deletes its subtasks and removes predecessor references to the deleted tasks. Concurrent task operations use a database transaction so additions cannot overwrite one another.

## Project progress

Overall percentage is calculated from task duration and effective task progress, using the same calculation as the website; it is not an independent editable percentage. Completed tasks count as 100%, pending/delayed tasks as 0%, and milestones have no duration weight. In-progress tasks use a positive stored percentage or the app's default of 50%.

To update one or more task percentages in a single transaction:

```bash
curl -X PATCH -H "Authorization: Bearer $NEWSLETTER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"in-progress","tasks":[{"id":"<taskId>","progress":60}]}' \
  'http://10.40.240.3:32280/api/projects/<projectId>/progress'
```

Here `status` changes the project's status. In a task patch, a percentage without a task status implies `pending` at 0%, `completed` at 100%, or `in-progress` otherwise. An explicit task status is also accepted. The whole update is rolled back if any task is missing or any percentage/status is invalid.

GET and PATCH return:

```json
{
  "projectId": "...",
  "status": "in-progress",
  "progress": 60,
  "taskCount": 4,
  "completedTaskCount": 2,
  "lastEditedAt": "2026-11-15T10:00:00.000Z"
}
```

An empty Gantt returns 0% progress. Standard errors are 401 for invalid/expired/revoked tokens, 403 for insufficient role, scope, or project access, 404 for missing projects/tasks, and 400 for invalid input.

## Installation

Normal container startup creates the private `access_tokens` collection through the existing schema sync. For a separately managed PocketBase installation, deploy the updated `pb_hooks`, run `npm run pb:sync-app-schema`, restart PocketBase, and serve the updated frontend. No new environment variables or services are required.

## Validation

```bash
ACCESS_TOKEN_TEST_PB_BINARY=/path/to/pocketbase npm run test:access-tokens-api
```

This uses a disposable local database and exercises the real production hooks. It does not modify the cluster.

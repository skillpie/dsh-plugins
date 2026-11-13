# dsh-datasource

English ｜ [简体中文](./README.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-datasource)](https://www.npmjs.com/package/dsh-datasource)

Connect to databases in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH), then query and edit data right in the conversation.

![Querying the demo database in a conversation](docs/demo.gif)

## What it does

### Browse and manage databases

- **DataSource panel in the sidebar**: browse connections, schemas and paginated data, and run SQL.
- **SQLite / PostgreSQL / MySQL**, with SQLite requiring no extra driver.

### Work in the conversation

- **Multi-select picker in the composer**: choose the databases this conversation may use.
- **Talk to the data**: four agent tools for querying, creating tables and writing data.
- **`/db` command**: type `/`, pick **DataSource** from the command list, and open the database panel.
- **Query history**: the global database panel groups history by conversation, and clicking a group opens that conversation.

## Install

From npm:

```bash
# macOS desktop
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add dsh-datasource@1.0.5
```

Restart DeepSeek Harness afterwards. On Windows / Linux use the `dsh` path installed on your machine.

From source:

```bash
git clone https://github.com/skillpie/dsh-plugins.git
"$DSH_CLI" plugin --profile desktop add "$PWD/dsh-plugins/dsh-datasource"
```

## Getting started

1. Open **DataSource** in the sidebar and create a connection, or use the built-in demo database.
2. Select the databases for the conversation, then ask the assistant to work with them:

> Show me the 10 most recent orders in the demo database, sorted by amount.
>
> Change every Hangzhou user's city to “Hangzhou · West Lake”.
>
> Add a notes field to the orders table.

The assistant can only access databases selected for the conversation; if none are selected, it asks you to choose one first.

## Configuration

Set these in the profile's `cordis.patch.yml`:

| Key | Default | Meaning |
| --- | --- | --- |
| `demo` | `true` | Create a demo database when there are no connections |
| `allowWrite` | `true` | Allow write operations |
| `agentTools` | `true` | Register the conversation tools |
| `maxRows` | `200` | Maximum rows returned by a query |

## Data and security

- Connections live in `~/.dsh/dsh-datasource/connections.json` with file mode `0600`.
- Passwords stay on this machine and never reach the browser or the model context.
- For production databases, use a read-only account or connection, or set `allowWrite: false`.

## Development

```bash
npm install
npm test
```

Issues and PRs are welcome: <https://github.com/skillpie/dsh-plugins/issues>

## License

MIT

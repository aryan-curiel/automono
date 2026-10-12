# Privacy

AutoMono is a local-first desktop app. There is no AutoMono account, no AutoMono server, no
analytics and no telemetry. Your clients, invoices, expenses and tax data stay in a SQLite
database and a folder of files on your Mac:

```
~/Library/Application Support/com.nagarestudio.automono/
```

Backups go only to the folder you choose in **Ajustes → Copia de seguridad**.

## What can leave your machine

### 1. Optional AI features (off unless you add an API key)

If you add an API key in **Ajustes**, the features below send data **directly from your Mac to the
provider you picked** (Anthropic, OpenAI or OpenRouter), under that provider's terms and privacy
policy. Nothing goes through a server run by AutoMono.

| Feature                      | What is sent                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Receipt extraction           | The receipt file (image or PDF) you're importing                                                                                                                                        |
| Contract term extraction     | The contract file you're attaching                                                                                                                                                      |
| Business document extraction | The registration document you're attaching (e.g. modelo 036/037)                                                                                                                        |
| Business context summary     | Text summaries of your business documents                                                                                                                                               |
| Tax assistant                | Your conversation, plus a summary of your figures: quarter and year totals, your top 5 clients by name and amount, unpaid totals, upcoming deadlines, and your business context summary |

Without an API key, none of these requests are made. PDF receipts still work using the built-in,
offline extraction.

API keys are stored in the macOS Keychain, not in the database.

### 2. Web fonts

The interface loads its fonts (Public Sans, IBM Plex Mono) from Google Fonts, which means Google
can see your IP address when the app starts. No other data is sent.

## Reporting a problem

If you find AutoMono sending data anywhere not listed here, please open an issue.

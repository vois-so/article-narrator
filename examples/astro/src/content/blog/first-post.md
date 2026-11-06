---
title: Back up your project folder in five minutes
description: A small habit that keeps your work safe.
pubDate: 2026-11-02
---

Most backups fail for one reason: nobody tests them. This post shows a simple test that takes 5 minutes a week.

## The weekly test

Do these steps each Friday:

1. Pick one file from last week.
2. Restore it to a new folder.
3. Open it and listen to the first 30 seconds.

The command below copies the folder. You do not need to read it aloud to understand the idea.

```sh
rsync -a --delete ~/Projects/podcast/ /Volumes/Backup/podcast/
```

| Folder | Size | Last test |
| --- | --- | --- |
| podcast | 12 GB | 2026-10-30 |
| audiobook | 48 GB | 2026-10-23 |

A good backup costs about $5 a month, and it saves you from 100% of the bad days. For more ideas, read the guide at https://example.com/backups.

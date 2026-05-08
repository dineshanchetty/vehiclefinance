// Loads .env BEFORE any other module imports run.
// Must be the FIRST import in index.ts. ESM evaluates dependencies depth-first,
// so any later import (e.g. ./agent/agent.js) that constructs a client at
// module-load time would otherwise see an empty process.env.
//
// override:true lets the .env file win over an empty/stale shell value
// (e.g. ANTHROPIC_API_KEY="" inherited from a parent process), which dotenv
// otherwise refuses to clobber.
import { config as loadDotenv } from 'dotenv';

loadDotenv({ override: true });

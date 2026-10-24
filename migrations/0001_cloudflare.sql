-- Apply once using npm run cloudflare:setup. No local SQLite is used in cloud mode.
CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,issuer TEXT NOT NULL,subject TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('user','admin')),status TEXT NOT NULL CHECK(status IN ('active','suspended')),created INTEGER NOT NULL,UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS wallets(owner TEXT PRIMARY KEY REFERENCES accounts(id),available INTEGER NOT NULL CHECK(available>=0),reserved INTEGER NOT NULL CHECK(reserved>=0));
      CREATE TABLE IF NOT EXISTS credits(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),type TEXT NOT NULL,delta INTEGER NOT NULL,balance INTEGER NOT NULL,created INTEGER NOT NULL,note TEXT NOT NULL,job_id TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS bonus_once ON credits(owner) WHERE type='signup_bonus';
      CREATE TABLE IF NOT EXISTS guests(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,remaining INTEGER NOT NULL CHECK(remaining>=0),max_seconds INTEGER NOT NULL,verified INTEGER,risk TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_budgets(id TEXT PRIMARY KEY,used INTEGER NOT NULL CHECK(used>=0));
      CREATE TABLE IF NOT EXISTS limits(id TEXT PRIMARY KEY,started INTEGER NOT NULL,count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS human_tokens(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,duration REAL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,input TEXT NOT NULL,credits INTEGER NOT NULL,duration INTEGER NOT NULL,policy_version TEXT NOT NULL,expires INTEGER NOT NULL,job_id TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,input TEXT NOT NULL,credits INTEGER NOT NULL,duration REAL NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,progress INTEGER NOT NULL,settled INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_expires INTEGER,result TEXT,error TEXT,trial_risk TEXT);
      CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status,created);
      CREATE TABLE IF NOT EXISTS idempotency(owner TEXT NOT NULL,operation TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,resource TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,operation,key));
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS daily_usage(id TEXT PRIMARY KEY,used INTEGER NOT NULL CHECK(used>=0));
      CREATE TABLE IF NOT EXISTS worker_heartbeats(id TEXT PRIMARY KEY,updated INTEGER NOT NULL);
      
CREATE TABLE IF NOT EXISTS mutation_revision(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CONSTRAINT optimistic_revision CHECK(version>=0));
INSERT OR IGNORE INTO mutation_revision VALUES(1,0);
CREATE TABLE IF NOT EXISTS voice_records(id TEXT PRIMARY KEY, record TEXT NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pipeline_metrics(job_id TEXT PRIMARY KEY, record TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads(owner,expires);
CREATE INDEX IF NOT EXISTS jobs_owner ON jobs(owner,created,id);
CREATE INDEX IF NOT EXISTS credits_owner ON credits(owner,seq);
CREATE INDEX IF NOT EXISTS accounts_email ON accounts(issuer,lower(email));

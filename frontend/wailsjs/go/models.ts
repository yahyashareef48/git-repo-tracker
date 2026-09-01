export namespace github {
	
	export class Health {
	    state: string;
	    cliFound: boolean;
	    version: string;
	    authed: boolean;
	    account: string;
	    scopes: string;
	    reachable: boolean;
	    rateLimit: number;
	    rateLeft: number;
	    message: string;
	    detail: string;
	    checkedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Health(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.cliFound = source["cliFound"];
	        this.version = source["version"];
	        this.authed = source["authed"];
	        this.account = source["account"];
	        this.scopes = source["scopes"];
	        this.reachable = source["reachable"];
	        this.rateLimit = source["rateLimit"];
	        this.rateLeft = source["rateLeft"];
	        this.message = source["message"];
	        this.detail = source["detail"];
	        this.checkedAt = source["checkedAt"];
	    }
	}

}

export namespace gitx {
	
	export class Branch {
	    name: string;
	    upstream: string;
	    ahead: number;
	    behind: number;
	    current: boolean;
	    remote: boolean;
	    subject: string;
	    age: string;
	    sha: string;
	    checkedOut: string;
	
	    static createFrom(source: any = {}) {
	        return new Branch(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.upstream = source["upstream"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.current = source["current"];
	        this.remote = source["remote"];
	        this.subject = source["subject"];
	        this.age = source["age"];
	        this.sha = source["sha"];
	        this.checkedOut = source["checkedOut"];
	    }
	}
	export class Change {
	    path: string;
	    orig: string;
	    staged: boolean;
	    kind: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new Change(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.orig = source["orig"];
	        this.staged = source["staged"];
	        this.kind = source["kind"];
	        this.code = source["code"];
	    }
	}
	export class Changes {
	    staged: Change[];
	    unstaged: Change[];
	    untracked: Change[];
	    conflicted: Change[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new Changes(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.staged = this.convertValues(source["staged"], Change);
	        this.unstaged = this.convertValues(source["unstaged"], Change);
	        this.untracked = this.convertValues(source["untracked"], Change);
	        this.conflicted = this.convertValues(source["conflicted"], Change);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Commit {
	    sha: string;
	    short: string;
	    subject: string;
	    body: string;
	    author: string;
	    email: string;
	    age: string;
	    date: string;
	    refs: string;
	    parents: number;
	
	    static createFrom(source: any = {}) {
	        return new Commit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sha = source["sha"];
	        this.short = source["short"];
	        this.subject = source["subject"];
	        this.body = source["body"];
	        this.author = source["author"];
	        this.email = source["email"];
	        this.age = source["age"];
	        this.date = source["date"];
	        this.refs = source["refs"];
	        this.parents = source["parents"];
	    }
	}
	export class CommitDetail {
	    commit: Commit;
	    files: Change[];
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.commit = this.convertValues(source["commit"], Commit);
	        this.files = this.convertValues(source["files"], Change);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Diff {
	    path: string;
	    staged: boolean;
	    text: string;
	    binary: boolean;
	    truncated: boolean;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new Diff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.staged = source["staged"];
	        this.text = source["text"];
	        this.binary = source["binary"];
	        this.truncated = source["truncated"];
	        this.error = source["error"];
	    }
	}
	export class OpResult {
	    ok: boolean;
	    op: string;
	    repo: string;
	    command: string;
	    stdout: string;
	    stderr: string;
	    error: string;
	    kind: string;
	    hint: string;
	
	    static createFrom(source: any = {}) {
	        return new OpResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.op = source["op"];
	        this.repo = source["repo"];
	        this.command = source["command"];
	        this.stdout = source["stdout"];
	        this.stderr = source["stderr"];
	        this.error = source["error"];
	        this.kind = source["kind"];
	        this.hint = source["hint"];
	    }
	}
	export class Stash {
	    ref: string;
	    subject: string;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new Stash(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ref = source["ref"];
	        this.subject = source["subject"];
	        this.age = source["age"];
	    }
	}
	export class Status {
	    path: string;
	    name: string;
	    root: string;
	    branch: string;
	    detached: boolean;
	    upstream: string;
	    ahead: number;
	    behind: number;
	    staged: number;
	    unstaged: number;
	    untracked: number;
	    conflicted: number;
	    stashCount: number;
	    remotes: string[];
	    hasRemote: boolean;
	    defaultBranch: string;
	    isWorktree: boolean;
	    commonDir: string;
	    lastCommit: string;
	    lastCommitAgo: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.root = source["root"];
	        this.branch = source["branch"];
	        this.detached = source["detached"];
	        this.upstream = source["upstream"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.staged = source["staged"];
	        this.unstaged = source["unstaged"];
	        this.untracked = source["untracked"];
	        this.conflicted = source["conflicted"];
	        this.stashCount = source["stashCount"];
	        this.remotes = source["remotes"];
	        this.hasRemote = source["hasRemote"];
	        this.defaultBranch = source["defaultBranch"];
	        this.isWorktree = source["isWorktree"];
	        this.commonDir = source["commonDir"];
	        this.lastCommit = source["lastCommit"];
	        this.lastCommitAgo = source["lastCommitAgo"];
	        this.error = source["error"];
	    }
	}

}

export namespace main {
	
	export class Env {
	    gitFound: boolean;
	    gitVersion: string;
	    storeFile: string;
	    storeError: string;
	    version: string;
	
	    static createFrom(source: any = {}) {
	        return new Env(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gitFound = source["gitFound"];
	        this.gitVersion = source["gitVersion"];
	        this.storeFile = source["storeFile"];
	        this.storeError = source["storeError"];
	        this.version = source["version"];
	    }
	}
	export class RepoDetail {
	    path: string;
	    name: string;
	    status: gitx.Status;
	    changes: gitx.Changes;
	    stashes: gitx.Stash[];
	    lastMessage: string;
	
	    static createFrom(source: any = {}) {
	        return new RepoDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.status = this.convertValues(source["status"], gitx.Status);
	        this.changes = this.convertValues(source["changes"], gitx.Changes);
	        this.stashes = this.convertValues(source["stashes"], gitx.Stash);
	        this.lastMessage = source["lastMessage"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RepoView {
	    path: string;
	    name: string;
	    pinned: boolean;
	    group: string;
	    status: gitx.Status;
	    worktrees: gitx.Status[];
	
	    static createFrom(source: any = {}) {
	        return new RepoView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.pinned = source["pinned"];
	        this.group = source["group"];
	        this.status = this.convertValues(source["status"], gitx.Status);
	        this.worktrees = this.convertValues(source["worktrees"], gitx.Status);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScanResult {
	    path: string;
	    name: string;
	    branch: string;
	    tracked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.branch = source["branch"];
	        this.tracked = source["tracked"];
	    }
	}

}

export namespace store {
	
	export class Settings {
	    autoFetchMinutes: number;
	    autoFetchEnabled: boolean;
	    startMinimised: boolean;
	    closeToTray: boolean;
	    pullFromMainRebase: boolean;
	    watchMode: string;
	    watchGroup: string;
	    watchPaths: string[];
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.autoFetchMinutes = source["autoFetchMinutes"];
	        this.autoFetchEnabled = source["autoFetchEnabled"];
	        this.startMinimised = source["startMinimised"];
	        this.closeToTray = source["closeToTray"];
	        this.pullFromMainRebase = source["pullFromMainRebase"];
	        this.watchMode = source["watchMode"];
	        this.watchGroup = source["watchGroup"];
	        this.watchPaths = source["watchPaths"];
	    }
	}

}

export namespace update {
	
	export class Info {
	    current: string;
	    latest: string;
	    available: boolean;
	    url: string;
	    notes: string;
	    published: string;
	    error: string;
	    checkedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.available = source["available"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	        this.published = source["published"];
	        this.error = source["error"];
	        this.checkedAt = source["checkedAt"];
	    }
	}

}


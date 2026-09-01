export namespace gitx {
	
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
	
	    static createFrom(source: any = {}) {
	        return new Env(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gitFound = source["gitFound"];
	        this.gitVersion = source["gitVersion"];
	        this.storeFile = source["storeFile"];
	        this.storeError = source["storeError"];
	    }
	}
	export class RepoView {
	    path: string;
	    name: string;
	    pinned: boolean;
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
	    pullFromMainRebase: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.autoFetchMinutes = source["autoFetchMinutes"];
	        this.autoFetchEnabled = source["autoFetchEnabled"];
	        this.startMinimised = source["startMinimised"];
	        this.pullFromMainRebase = source["pullFromMainRebase"];
	    }
	}

}


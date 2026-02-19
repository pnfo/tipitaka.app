export class BackendAdapter {
    static async query(payload) {
        if (window.Android && window.Android.query) {
            // Android Native Mode
            // Android interface usually returns string, so we parse it.
            // If it returns a promise (unlikely for simple @JavascriptInterface), we await.
            // Assuming synchronous blocking call for now as per plan.
            const responseStr = window.Android.query(JSON.stringify(payload));
            return JSON.parse(responseStr);
        } else {
            // Web/Desktop Mode (Go Server)
            const response = await fetch('/tipitaka-query/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        }
    }
}

export class FTSQuery {
    constructor(query) {
        this.query = query;
    }
    async runQuery() {
        return await BackendAdapter.query(this.query);
    }
}

export class DictionaryQuery {
    constructor(query) {
        this.query = query;
    }
    async runQuery() {
        return await BackendAdapter.query(this.query);
    }
}

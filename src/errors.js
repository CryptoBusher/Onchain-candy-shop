export class NotImplementedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export class AlreadyDoneError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AlreadyDoneError';
    }
}

export class LowBalanceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LowBalance';
    }
}

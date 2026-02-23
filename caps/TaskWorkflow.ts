
type TaskType = 'serial' | 'parallel' | 'step';

type Task = {
    type: TaskType;
    name: string;
    fn: () => void | Promise<void>;
    children: Task[];
    timeout?: number;
};

export async function capsule({
    encapsulate,
    CapsulePropertyTypes,
    makeImportStack
}: {
    encapsulate: any
    CapsulePropertyTypes: any
    makeImportStack: any
}) {
    return encapsulate({
        '#@stream44.studio/encapsulate/spine-contracts/CapsuleSpineContract.v0': {
            '#@stream44.studio/encapsulate/structs/Capsule': {},
            '#': {

                lib: {
                    type: CapsulePropertyTypes.Mapping,
                    value: 't44/caps/ProjectTestLib',
                },

                _rootTasks: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as Task[],
                },

                _currentParent: {
                    type: CapsulePropertyTypes.Literal,
                    value: null as Task | null,
                },

                _breadcrumb: {
                    type: CapsulePropertyTypes.Literal,
                    value: [] as string[],
                },

                exitOnComplete: {
                    type: CapsulePropertyTypes.Literal,
                    value: true,
                },

                serial: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, name: string, fn: () => void | Promise<void>) {
                        const task: Task = {
                            type: 'serial',
                            name,
                            fn,
                            children: []
                        };

                        if (this._currentParent) {
                            this._currentParent.children.push(task);
                        } else {
                            this._rootTasks.push(task);
                        }

                        const previousParent = this._currentParent;
                        this._currentParent = task;
                        fn();
                        this._currentParent = previousParent;
                    }
                },

                parallel: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, name: string, fn: () => void | Promise<void>) {
                        const task: Task = {
                            type: 'parallel',
                            name,
                            fn,
                            children: []
                        };

                        if (this._currentParent) {
                            this._currentParent.children.push(task);
                        } else {
                            this._rootTasks.push(task);
                        }

                        const previousParent = this._currentParent;
                        this._currentParent = task;
                        fn();
                        this._currentParent = previousParent;
                    }
                },

                step: {
                    type: CapsulePropertyTypes.Function,
                    value: function (this: any, name: string, fn: () => void | Promise<void>, timeout?: number) {
                        const task: Task = {
                            type: 'step',
                            name,
                            fn,
                            children: [],
                            timeout,
                        };

                        if (this._currentParent) {
                            this._currentParent.children.push(task);
                        } else {
                            this._rootTasks.push(task);
                        }
                    }
                },

                _executeTask: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any, task: Task): Promise<void> {
                        const previousBreadcrumb = [...this._breadcrumb];
                        this._breadcrumb.push(task.name);
                        const trail = this._breadcrumb.join(' -> ');

                        const colors = {
                            reset: '\x1b[0m',
                            blue: '\x1b[34m',
                            cyan: '\x1b[36m',
                            magenta: '\x1b[35m',
                            green: '\x1b[32m',
                            red: '\x1b[31m',
                        };

                        let startSymbol = '▶';
                        let color = colors.reset;

                        if (task.type === 'serial') {
                            startSymbol = '⚡';
                            color = colors.blue;
                        } else if (task.type === 'parallel') {
                            startSymbol = '⚙';
                            color = colors.magenta;
                        } else {
                            startSymbol = '▸';
                            color = colors.cyan;
                        }

                        console.log(`${color}${startSymbol} ${trail}${colors.reset}`);

                        try {
                            if (task.type === 'serial') {
                                for (const child of task.children) {
                                    await this._executeTask(child);
                                }
                            } else if (task.type === 'parallel') {
                                await Promise.all(task.children.map((child: Task) => this._executeTask(child)));
                            } else {
                                await task.fn();
                            }
                            console.log(`${colors.green}✓ ${trail}${colors.reset}`);
                        } catch (error) {
                            console.log(`${colors.red}✗ ${trail}${colors.reset}`);
                            throw error;
                        } finally {
                            this._breadcrumb = previousBreadcrumb;
                        }
                    }
                },

                run: {
                    type: CapsulePropertyTypes.Function,
                    value: async function (this: any): Promise<void> {
                        try {
                            for (const task of this._rootTasks) {
                                await this._executeTask(task);
                            }
                        } finally {
                            this._rootTasks = [];
                            this._breadcrumb = [];
                            this._currentParent = null;
                        }

                        if (this.exitOnComplete) process.exit(0);
                    }
                },
            }
        }
    }, {
        importMeta: import.meta,
        importStack: makeImportStack(),
        capsuleName: capsule['#'],
    })
}
capsule['#'] = 't44/caps/TaskWorkflow'

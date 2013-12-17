/// <reference path="DefinitelyTyped/jquery/jquery.d.ts"/>

interface JQConsoleSettings {
    promptLabel?: string;
    continuedPromptLabel?: string;
    commandHandle?: (cmd: string) => any;
    tabComplete?: () => void;
    autofocus?: boolean;
    animateScroll?: boolean;
    promptHistory?: boolean;
    welcomeMessage?: string;
    charInsertTrigger?: (keyCode: number, promptText: string) => any;
    historyPreserveColumn?: boolean;
    commandValidate?: (cmd: string) => boolean;
    cancelHandle?: () => void;
}

interface JQConsole {
    (settings?: JQConsoleSettings): JQConsole;
    promptLabel: string;
    promptText: (txt?: string) => string;
    reprompt: () => void;
    onreprompt: () => void;
    message: (msg: string, mtype: string, reprompt?: boolean) => void;
    commandHandle: (cmd: string) => any;
}

interface JQuery {
    console: JQConsole;
}

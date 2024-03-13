import { createContext, useContext, useEffect, useRef, useState } from "react";

// 日志模板
const logTemplate = { log: [], update: (_log: string[]) => {} };

// 日志上下文
export const LogContext = createContext(logTemplate);

// 日志供应
export default function LogProvider({ children }) {
    const [log, setLog] = useState([]);

    return <LogContext.Provider value={{ log, update: setLog }}>{children}</LogContext.Provider>;
}

// 日志服务
export function useLog() {
    const { log, update } = useContext(LogContext);
    // 写入日志的参考，写入操作可能是异步的，使用 ref 可以写入最新的日志状态
    const writeRef = useRef<(newLog: string) => void>(null);

    useEffect(() => {
        writeRef.current = (newLog: string) => void update([...log, newLog]);
    }, [log, update]);

    return { log, writeRef };
}
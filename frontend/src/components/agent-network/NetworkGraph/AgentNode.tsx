import { Handle, type Position } from "@xyflow/react";
import { memo } from "react";
import styles from './AgentNode.module.css';
import { AiOutlineMail } from 'react-icons/ai';
import { SiMlflow } from 'react-icons/si';
import { PiCoins } from 'react-icons/pi';
import { LuTimer } from 'react-icons/lu';
import ThinkingAnimation from './ThinkingAnimation';
import WorkingAnimation from './WorkingAnimation';
import UsingToolAnimation from './UsingToolAnimation';

interface AgentNodeData {
  label: string;
  role?: string;
  model?: string;
  avatar?: string;
  agentState?: {
    status: string;
    totalTokens: number;
    messageCount: number;
    cycleCount: number;
    latency: number;
  };
  handlePosition?: Position;
  targetPosition?: Position;
  sourcePosition?: Position;
}

function AgentNode({ data, isConnectable }: { data: AgentNodeData; isConnectable: boolean }) {

    function formatLatency(latency: number) {
        if (!latency && latency !== 0) {
            return '0ms';
        }
        if (latency < 1000) {
            return `${latency}ms`;
        } else if (latency < 60000) {
            return `${(latency / 1000).toFixed(2)}s`;
        } else {
            //format to minutes and seconds
            const minutes = Math.floor(latency / 60000);
            const seconds = ((latency % 60000) / 1000).toFixed(0);
            return `${minutes} min ${seconds.padStart(2, '0')}s`;
        }
    }

  return (
    <>

        <div className={styles.container}>
            {data.avatar && (
                <div className={styles.avatarContainer}>
                    <img src={data.avatar} alt={data.label} className={styles.avatar} />
                    {data.agentState && data.agentState.status !== 'READY' && data.agentState.status !== 'STOPPED' && (
                        <>
                            <div className={styles.smallBubble}></div>
                            <div className={styles.smallBubble2}></div>
                            <div className={styles.statusBubble}>
                                {data.agentState.status == 'WORKING' && <WorkingAnimation />}
                                {data.agentState.status == 'THINKING' && <ThinkingAnimation />}
                                {data.agentState.status == 'USING_TOOL' && <UsingToolAnimation />}
                            </div>
                        </>
                    )}
                </div>
            )}
            <div>
                <div className={styles.label}>{data.label}</div>
                {data.role && <div className={styles.role}>{data.role}</div>}
                {data.model && <div className={styles.model}>{data.model}</div>}
                {false && data.agentState && <div className={styles.model}>{data.agentState.status}</div>}
                {data.agentState && (
                    <div className={styles.agentStats}>
                        <span className={styles.stat}>{data.agentState.totalTokens}<PiCoins/></span>
                        <span className={styles.stat}>{data.agentState.messageCount}<AiOutlineMail/></span>
                        <span className={styles.stat}>{data.agentState.cycleCount}<SiMlflow/></span>
                        <span className={styles.stat}>{formatLatency(data.agentState.latency)}<LuTimer/></span>
                    </div>
                )}
            </div>
        </div>
        <div>
        <Handle
            type="target"
            position={data.targetPosition || data.handlePosition}
            onConnect={(params) => console.log('handle onConnect', params)}
            isConnectable={isConnectable}
            className={`${styles.handle} ${styles.handleSource}`}
        />
        <Handle
            type="source"
            position={data.sourcePosition || data.handlePosition}
            isConnectable={isConnectable}
            className={`${styles.handle} ${styles.handleSource}`}
        />
        </div>
    </>
  );
}

export default memo(AgentNode)
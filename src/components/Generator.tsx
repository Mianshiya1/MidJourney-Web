import {useLocalStorage} from '@/hooks/useLocalStorage';
import SystemSetting from '@/components/SystemSetting';
import SingleMsg from '@/components/SingleMsg';
import React, {useEffect, useRef, useState} from 'react';
import ErrorMsg from '@/components/ErrorMsg';
import SendArea from '@/components/SendArea';
import {useAtom} from 'jotai';
import {msgAtom} from '@/hooks/useMessageList';
import {useGenerateResult} from '@/hooks/useGenerateResult';
import {useThrottleFn} from 'ahooks';
import {useQueryTaskInfo, userPlanAtom} from '@/hooks/useQueryTaskInfo';
import {ChatMessageProcessor} from '@/utils/Chat/ChatMessageProcessor';
import {afterTrimStartWith} from '@/utils/string';
import {ChatMessage} from '../../types';
import {judgeUserActionByInput, judgeUserActionByType} from '@/utils/Chat/MsgProcess';
import {
    getTaskIdAtom,
    ifTaskOnWorkingAtom,
    setTaskIdAtom,
    taskInfoAtom,
} from '@/hooks/useTaskInfo';


export default function () {
    let inputRef = useRef<HTMLInputElement>(null);
    const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = useState('');
    const { getItem, setItem } = useLocalStorage();
    const [messageList, setMsgList] = useAtom(msgAtom.msgListAtom);
    const [, addUserMsg] = useAtom(msgAtom.addUserMsgAtom);
    const [, addUser] = useAtom(msgAtom.addUserAtom);
    const [, emptyAllList] = useAtom(msgAtom.emptyMsgListAtom);
    const [, delLastAssistantMsg] = useAtom(msgAtom.delLastAssistantMsgAtom);
    const [, addAssistantMsgAtom] = useAtom(msgAtom.AddAssistantMsgAtom);
    const [taskInfo] = useAtom(taskInfoAtom);
    const [userPlan] = useAtom(userPlanAtom);
    const [taskId] = useAtom(getTaskIdAtom);
    const { refetch: refetchTaskInfo,data } = useQueryTaskInfo();

    const[taskNow,setTaskNow] = useAtom(taskInfoAtom)
    const[,addAssistantMsg] = useAtom(msgAtom.AddAssistantMsgAtom)
    const [ifOnTask,setEndTask] = useAtom(ifTaskOnWorkingAtom)

    useEffect(() => {
        let taskNowInfo ;
        if(!data){return}
        taskNowInfo= {
            taskId: data?.id,
            prompt: data?.prompt,
            promptEn: data?.promptEn,
            progress: data?.progress,
            action: data?.action,
            imgUrl: data?.imageUrl,
            status: data?.status,
            finished: data?.progress === "100%",
        }
        setTaskNow(taskNowInfo)
        if(data?.progress === "100%"){
            taskNow&&addAssistantMsg(taskNowInfo)
            setEndTask(false)
        }
    },[data])

    const isAllowCache = useRef(false);
    const {
        currentError,
        generatedResults, generate, stopStream,
    } = useGenerateResult();

    const [loading, setLoading] = useAtom(ifTaskOnWorkingAtom);
    //test
    useEffect(() => {
        if (isAllowCache.current) {
            const sortedMessages = new ChatMessageProcessor(messageList, userPlan).sortedMessages;
            setItem('messageList', JSON.stringify(sortedMessages));
        }
    }, [messageList]);


    const smoothToBottom = useThrottleFn(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, { wait: 400 });

    useEffect(() => {
        getItem('messageList')
            .then((msgLists) => {
                console.log('msgLists', msgLists);
                // exclude {}
                if (msgLists && msgLists !== '{}') {
                    // todo: recover
                    setMsgList(JSON.parse(msgLists as any));
                }
            })
            .catch(err => console.log('getItem err', err))

        setTimeout(() => {
            isAllowCache.current = true;
        }, 1000);

        // window.addEventListener('beforeunload', handleBeforeUnload);
        // return () => {
        //     window.removeEventListener('beforeunload', handleBeforeUnload);
        // };

    }, []);


    const handleButtonClick = async () => {
        const inputValue = inputRef?.current;
        if (!inputValue)
            return;
        if (!inputValue.value.trim()) {
            return;
        }

        const newUserMsg = {
            role: 'user',
            content: inputValue.value,
            action: judgeUserActionByInput(inputValue.value),
            time: new Date().getTime(),
        } as ChatMessage;
        addUserMsg(inputValue.value);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
        await requestWithLatestMessage(newUserMsg);
    };

    const archiveCurrentMessage = (result: ChatMessage) => {
        if (result) {
            addAssistantMsgAtom(result);
            inputRef.current?.focus();
        }
    };
    const clear = () => {
        if (inputRef.current) {
            inputRef.current.value = '';
        }
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
        emptyAllList();
    };
    const stopStreamFetch = () => {
        stopStream();
        archiveCurrentMessage(generatedResults);
    };

    const retryLastFetch = () => {
        delLastAssistantMsg();
        // requestWithLatestMessage().then(
        //     () => {
        //     },
        // );
    };

    const clickAction = async(info:any) => {
        const newUserMsg = {
            role: 'user',
            content: info?.content,
            action: judgeUserActionByType(info?.type),
            actionInfo:{
              taskId:info?.taskId,
              index:info?.index,
            },
            time: new Date().getTime(),
        } as ChatMessage;
        addUser(newUserMsg);
        await requestWithLatestMessage(newUserMsg);


        console.log(info);
    }
    useEffect(() => {
        smoothToBottom.run();
    }, [loading]);

    useEffect(() => {
        return () => {
            console.log(taskNow);
        };
    }, [taskNow]);


    const requestWithLatestMessage = async (newMessage:ChatMessage) => {
        setLoading(true);
        console.log(newMessage);
        await generate(newMessage).then();
        // refetchUserInfo().then();
        // setTimeout(() => {
        //     setLoading(false);
        // },300);
    };

    const handleKeydown = (e: KeyboardEvent) => {
        if (e.isComposing || e.shiftKey)
            return;

        if (e.key === 'Enter')
            handleButtonClick().then(r => {
            });
    };


    return (
        <>
            <div className="mt-6 mb-1">
                <SystemSetting/>
                { messageList.map((message, index) => (
                    <SingleMsg
                        key={ index }
                        role={ message.role }
                        message={ message.content }
                        result={ message.result }
                        showRetry={ () => (message.role === 'assistant' && index === messageList.length - 1) }
                        onRetry={ retryLastFetch }
                        clickAction={ clickAction}
                    />
                )) }
                { loading && taskNow && (
                    <SingleMsg
                        role="assistant"
                        message={ taskNow.prompt??'' }
                        result={ taskNow }
                        showRetry={ ()=>true}
                        onRetry={ retryLastFetch }
                    />
                ) }

                { currentError &&
                    <ErrorMsg data={ currentError } onRetry={ retryLastFetch }/> }
                <SendArea ifDisabled={ false }
                          handleStopClick={ stopStreamFetch }
                          handleKeydown={ handleKeydown }
                          handleButtonClick={ handleButtonClick }
                          clear={ clear }
                          inputRefItem={ inputRef }
                          ifLoading={ loading }/>
            </div>

        </>

    );
}

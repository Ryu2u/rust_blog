import {MdEditor} from "../../comonents/MdEditor";
import {Button, Form, Input, Modal, Switch} from "antd";
import {DeliveredProcedureOutlined, SaveOutlined} from "@ant-design/icons";
import type {DraggableData, DraggableEvent} from 'react-draggable';
import Draggable from 'react-draggable';
import {useRef, useState} from "react";
import PostService from "../../service/PostService";
import {Post} from "../../common/Structs";

const layout = {
    labelCol: {span: 4},
    wrapperCol: {span: 12},
};


export function ArticleEditPage() {

    const [form] = Form.useForm();
    const [originContent, setOriginContent] = useState("");


    function getContent(content: string) {
        setOriginContent(content);
    }

    const [open, setOpen] = useState(false);
    const [disabled, setDisabled] = useState(true);
    const [bounds, setBounds] = useState({left: 0, top: 0, bottom: 0, right: 0});
    const draggleRef = useRef<HTMLDivElement | null>(null);

    const showModal = () => {
        setOpen(true);
    };

    const handleOk = (_: React.MouseEvent<HTMLElement>) => {
        form.submit();
        // setOpen(false);
    };

    const handleCancel = (_: React.MouseEvent<HTMLElement>) => {
        setOpen(false);
    };

    const onStart = (_event: DraggableEvent, uiData: DraggableData) => {
        const {clientWidth, clientHeight} = window.document.documentElement;
        const targetRect = draggleRef.current?.getBoundingClientRect();
        if (!targetRect) {
            return;
        }
        setBounds({
            left: -targetRect.left + uiData.x,
            right: clientWidth - (targetRect.right - uiData.x),
            top: -targetRect.top + uiData.y,
            bottom: clientHeight - (targetRect.bottom - uiData.y),
        });
    };


    const onFinish = (values: any) => {
        console.log('Finish:', values);
        let post: Post = values;
        post.is_view = post.is_view ? 1 : 0;
        post.disallow_comment = post.disallow_comment ? 1 : 0;
        post.original_content = originContent;
        post.format_content = '';
        console.log(post);
        PostService.post_add(post).then((res) => {
            console.log(res);
            setOpen(false);
            form.resetFields();
        })
    };

    return (
        <>
            <div className={"article-tool-div"}>
                <Button type={"default"}>
                    <SaveOutlined/>
                    保存
                </Button>
                <Button type={"primary"} onClick={showModal}>
                    <DeliveredProcedureOutlined/>
                    发布
                </Button>
            </div>
            <MdEditor setContent={getContent}/>
            <Modal
                title={
                    <div
                        style={{
                            width: '100%',
                            cursor: 'move',
                            borderBottom: '1px solid #8888'
                        }}
                        onMouseOver={() => {
                            if (disabled) {
                                setDisabled(false);
                            }
                        }}
                        onMouseOut={() => {
                            setDisabled(true);
                        }}
                        onFocus={() => {
                        }}
                        onBlur={() => {
                        }}
                    >
                        文章信息
                    </div>
                }
                open={open}
                closable={false}
                maskClosable={false}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={"发布"}
                cancelText={"取消"}
                width={600}
                modalRender={(modal) => (
                    <Draggable
                        disabled={disabled}
                        bounds={bounds}
                        nodeRef={draggleRef}
                        onStart={(event, uiData) => onStart(event, uiData)}
                    >
                        <div ref={draggleRef}>{modal}</div>
                    </Draggable>
                )}
            >
                <Form {...layout} form={form} onFinish={onFinish}>
                    <Form.Item name={"title"}
                               label={"标题"}
                               rules={[{required: true, message: '请输入文章标题!', max: 30}]}
                    >
                        <Input/>
                    </Form.Item>
                    <Form.Item name={"author"}
                               label={"作者"}
                               rules={[{required: true, message: '请输入文章作者!', max: 30}]}
                    >
                        <Input/>
                    </Form.Item>
                    <Form.Item name={"is_view"}
                               label={"展示"}
                               valuePropName="checked"
                               initialValue={true}
                               rules={[{required: true, message: ''}]}
                    >
                        <Switch/>
                    </Form.Item>
                    <Form.Item name={"summary"}
                               label={"摘要"}
                               rules={[{required: true, message: '请填写文章摘要并<200字!', max: 200}]}
                    >
                        <Input.TextArea allowClear autoSize showCount maxLength={200}/>
                    </Form.Item>

                    <Form.Item name={"disallow_comment"}
                               label={"允许评论"}
                               initialValue={true}
                               valuePropName="checked"
                               rules={[{required: false, message: ''}]}
                    >
                        <Switch/>
                    </Form.Item>

                    <Form.Item name={"password"}
                               label={"文章密码"}
                               rules={[{required: false, message: '密码长度不能超过20!', max: 20}]}
                    >
                        <Input/>
                    </Form.Item>

                    <Form.Item name={"top_priority"}
                               label={"置顶"}
                               valuePropName="checked"
                               rules={[{required: false, message: 'Please input title!'}]}
                    >
                        <Switch/>
                    </Form.Item>

                    <Form.Item name={"cover_img"}
                               label={"封面图片"}
                               rules={[{required: false, message: ''}]}
                    >
                        <Input/>
                    </Form.Item>

                </Form>
            </Modal>

        </>
    )
}
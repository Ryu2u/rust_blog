import {MdEditor} from "../../comonents/MdEditor";
import {Button, Form, Input, message, Modal, Switch} from "antd";
import {DeleteOutlined, DeliveredProcedureOutlined, ExclamationCircleFilled} from "@ant-design/icons";
import type {DraggableData, DraggableEvent} from 'react-draggable';
import Draggable from 'react-draggable';
import {useEffect, useRef, useState} from "react";
import PostService from "../../service/PostService";
import {Post} from "../../common/Structs";
import {useParams, useNavigate} from "react-router-dom";

const layout = {
    labelCol: {span: 4},
    wrapperCol: {span: 12},
};


export function ArticleEditPage() {
    const {confirm} = Modal;

    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [originContent, setOriginContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [initValue, setInitValue] = useState("");
    const param = useParams();
    const postRef = useRef(new Post());

    useEffect(() => {
        const id = param['id'];
        if (id) {
            PostService.post_get(parseInt(id)).then(res => {
                let post: Post = res.obj;
                postRef.current = post;
                setInitValue(post.original_content);
                setLoading(false);
            })
        } else {
            setLoading(false);
        }

    }, [param])

    function getContent(content: string) {
        setOriginContent(content);
    }

    const [open, setOpen] = useState(false);
    const [disabled, setDisabled] = useState(true);
    const [bounds, setBounds] = useState({left: 0, top: 0, bottom: 0, right: 0});
    const draggleRef = useRef<HTMLDivElement | null>(null);

    const showModal = () => {
        openModal();
    };

    function openModal() {
        setOpen(true);
        if (postRef.current.id) {
            form.setFieldsValue({
                id: postRef.current.id,
                title: postRef.current.title,
                author: postRef.current.author,
                is_view: postRef.current.is_view,
                summary: postRef.current.summary,
                disallow_comment: postRef.current.disallow_comment,
                password: postRef.current.password,
                top_priority: postRef.current.top_priority,
                cover_img: postRef.current.cover_img
            });
        }
    }

    const handleOk = (_: React.MouseEvent<HTMLElement>) => {
        form.submit();
    };

    const handleCancel = (_: React.MouseEvent<HTMLElement>) => {
        setOpen(false);
    };

    const onStart = (_event: DraggableEvent, uiData: DraggableData) => {
        const {clientWidth, clientHeight} = window.document.documentElement;
        // @ts-ignore
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
        postRef.current = values;
        console.log(postRef.current);
        postRef.current.original_content = originContent;
        postRef.current.format_content = '';
        if (postRef.current.id) {
            updatePost();
        } else {
            addPost();
        }
    };

    function addPost() {
        PostService.post_add(postRef.current).then((res) => {
            message.success(res.msg);
            setOpen(false);
            navigate('/article/list');
        })

    }

    function updatePost() {
        PostService.post_update(postRef.current).then(res => {
            message.success(res.msg);
            setOpen(false);
            navigate('/article/list');
        });
    }

    const deleteClick = () => {
        confirm({
            title: '是否需要删除改文章!',
            icon: <ExclamationCircleFilled/>,
            content: '请确认，该操作可能无法恢复!',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk() {
                if (!postRef.current.id) {
                    alert("该文章不存在!");
                    return;
                }
                PostService.post_delete(postRef.current.id).then(res => {
                    message.success(res.msg);
                    navigate('/article/list');
                })
            },
            onCancel() {
                console.log('Cancel');
            },
        });
    }


    return (
        <>
            <div className={"article-tool-div"}>
                {/*<Button type={"default"} onClick={saveClick}>*/}
                {/*    <SaveOutlined/>*/}
                {/*    保存*/}
                {/*</Button>*/}
                <Button danger onClick={deleteClick}>
                    <DeleteOutlined/>
                    删除
                </Button>
                <Button type={"primary"} onClick={showModal}>
                    <DeliveredProcedureOutlined/>
                    {postRef.current.id ? "更新" : "发布"}
                </Button>
            </div>
            {
                !loading &&
                <MdEditor getContent={getContent} content={initValue}/>
            }
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
                okText={
                    postRef.current.id ?
                        "更新"
                        :
                        "发布"
                }
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
                    <Form.Item name={"id"}
                               label={"id"}
                               hidden={true}
                               rules={[{required: false}]}>
                        <Input/>
                    </Form.Item>
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
                               initialValue={1}
                               normalize={(value) => value ? 1 : 0}
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
                               label={"不允许评论"}
                               initialValue={1}
                               normalize={(value) => value ? 1 : 0}
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
                               normalize={(value) => value ? 1 : 0}
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
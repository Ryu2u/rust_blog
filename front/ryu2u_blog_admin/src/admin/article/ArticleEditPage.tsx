import {MdEditor} from "../../comonents/MdEditor";
import {Button, Form, Input, message, Modal, Switch, Space, Card, Alert} from "antd";
import {DeleteOutlined, SaveOutlined, ExclamationCircleFilled, UploadOutlined, EyeOutlined} from "@ant-design/icons";
import {useEffect, useRef, useState} from "react";
import PostService from "../../service/PostService";
import {Post} from "../../common/Structs";
import {useParams, useNavigate} from "react-router-dom";

const {TextArea} = Input;


export function ArticleEditPage() {
    const {confirm} = Modal;
    const [messageApi, contextHolder] = message.useMessage();

    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [originContent, setOriginContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
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
            }).catch(error => {
                messageApi.error('加载文章失败');
                console.error('Error loading post:', error);
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

    const showModal = () => {
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
        } else {
            // 设置默认值
            form.setFieldsValue({
                author: 'Admin',
                is_view: 1,
                disallow_comment: 0,
                top_priority: 0
            });
        }
    };

    const handleOk = () => {
        form.submit();
    };

    const handleCancel = () => {
        setOpen(false);
    };

    const onFinish = (values: any) => {
        setSubmitting(true);
        postRef.current = values;
        postRef.current.original_content = originContent;
        postRef.current.format_content = '';
        
        const request = postRef.current.id 
            ? PostService.post_update(postRef.current)
            : PostService.post_add(postRef.current);

        request.then((res) => {
            messageApi.success(res.msg);
            setOpen(false);
            navigate('/article/list');
        }).catch(error => {
            messageApi.error('操作失败，请重试');
            console.error('Error:', error);
        }).finally(() => {
            setSubmitting(false);
        });
    };

    const deleteClick = () => {
        if (!postRef.current.id) {
            messageApi.warning('该文章不存在!');
            return;
        }
        
        confirm({
            title: '是否需要删除这篇文章?',
            icon: <ExclamationCircleFilled/>,
            content: '请确认，该操作可能无法恢复!',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk() {
                setLoading(true);
                PostService.post_delete(postRef.current.id).then(res => {
                    messageApi.success(res.msg);
                    navigate('/article/list');
                }).catch(error => {
                    messageApi.error('删除失败，请重试');
                    console.error('Error deleting post:', error);
                }).finally(() => {
                    setLoading(false);
                });
            },
        });
    }

    return (
        <>
            {contextHolder}
            <Card
                title={postRef.current.id ? "编辑文章" : "新建文章"}
                extra={
                    <Space>
                        <Button 
                            type="default" 
                            icon={<EyeOutlined />}
                            onClick={() => {
                                if (postRef.current.id) {
                                    window.open(`/article/${postRef.current.id}`, '_blank');
                                } else {
                                    messageApi.warning('请先保存文章');
                                }
                            }}
                        >
                            预览
                        </Button>
                        <Button 
                            danger 
                            icon={<DeleteOutlined />}
                            onClick={deleteClick}
                            disabled={!postRef.current.id}
                        >
                            删除
                        </Button>
                        <Button 
                            type="primary" 
                            icon={<SaveOutlined />}
                            onClick={showModal}
                        >
                            {postRef.current.id ? "更新" : "发布"}
                        </Button>
                    </Space>
                }
            >
                <Alert 
                    message="提示" 
                    description="请在下方编辑器中编写文章内容，完成后点击发布按钮保存" 
                    type="info" 
                    showIcon 
                    style={{ marginBottom: 20 }} 
                />
                
                {!loading ? (
                    <MdEditor getContent={getContent} content={initValue} />
                ) : (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>加载中...</div>
                )}
            </Card>
            
            <Modal
                title="文章信息"
                open={open}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={postRef.current.id ? "更新" : "发布"}
                cancelText="取消"
                width={600}
                confirmLoading={submitting}
            >
                <Form 
                    form={form} 
                    onFinish={onFinish}
                    layout="vertical"
                >
                    <Form.Item 
                        name="id" 
                        hidden 
                    >
                        <Input />
                    </Form.Item>
                    
                    <Form.Item 
                        name="title" 
                        label="标题" 
                        rules={[{ required: true, message: '请输入文章标题!', max: 30 }]}
                    >
                        <Input placeholder="请输入文章标题" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="author" 
                        label="作者" 
                        rules={[{ required: true, message: '请输入文章作者!', max: 30 }]}
                    >
                        <Input placeholder="请输入文章作者" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="cover_img" 
                        label="封面图片"
                    >
                        <Input 
                            placeholder="请输入封面图片URL" 
                            addonAfter={<UploadOutlined />}
                        />
                    </Form.Item>
                    
                    <Form.Item 
                        name="summary" 
                        label="摘要" 
                        rules={[{ required: true, message: '请填写文章摘要!', max: 200 }]}
                    >
                        <TextArea 
                            placeholder="请填写文章摘要" 
                            allowClear 
                            autoSize={{ minRows: 3, maxRows: 6 }} 
                            showCount 
                            maxLength={200}
                        />
                    </Form.Item>
                    
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Form.Item 
                            name="is_view" 
                            label="展示" 
                            valuePropName="checked"
                            normalize={(value) => value ? 1 : 0}
                            initialValue={true}
                        >
                            <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                        
                        <Form.Item 
                            name="disallow_comment" 
                            label="不允许评论" 
                            valuePropName="checked"
                            normalize={(value) => value ? 1 : 0}
                            initialValue={false}
                        >
                            <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                        
                        <Form.Item 
                            name="top_priority" 
                            label="置顶" 
                            valuePropName="checked"
                            normalize={(value) => value ? 1 : 0}
                            initialValue={false}
                        >
                            <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                        
                        <Form.Item 
                            name="password" 
                            label="文章密码"
                        >
                            <Input 
                                type="password" 
                                placeholder="留空表示不加密" 
                            />
                        </Form.Item>
                    </Space>
                </Form>
            </Modal>
        </>
    )
}
import { Button, Form, Input, message, Modal, Switch, Space, Card, Alert, Select } from "antd";
import { DeleteOutlined, SaveOutlined, ExclamationCircleFilled, UserOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { User } from "../../common/Structs";
import { useParams, useNavigate } from "react-router-dom";

const { Option } = Select;


export function UserEditPage() {
    const { confirm } = Modal;
    const [messageApi, contextHolder] = message.useMessage();

    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const param = useParams();
    const userRef = useRef(new User());

    useEffect(() => {
        const id = param['id'];
        if (id) {
            // 模拟加载用户数据
            setTimeout(() => {
                const mockUser: User = {
                    id: parseInt(id),
                    username: `user${id}`,
                    nick_name: `测试用户${id}`,
                    gender: 1,
                    signature: `这是用户${id}的个性签名`,
                    created_time: Date.now() - 30 * 24 * 60 * 60 * 1000,
                    locked: 0
                };
                userRef.current = mockUser;
                form.setFieldsValue(mockUser);
                setLoading(false);
            }, 500);
        } else {
            setLoading(false);
        }

    }, [param])

    const [open, setOpen] = useState(false);

    const showModal = () => {
        setOpen(true);
        if (!userRef.current.id) {
            // 设置默认值
            form.setFieldsValue({
                gender: 1,
                locked: 0
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
        userRef.current = values;
        
        // 模拟保存操作
        setTimeout(() => {
            messageApi.success(userRef.current.id ? "更新成功" : "创建成功");
            setOpen(false);
            navigate('/user/list');
            setSubmitting(false);
        }, 500);
    };

    const deleteClick = () => {
        if (!userRef.current.id) {
            messageApi.warning('该用户不存在!');
            return;
        }
        
        confirm({
            title: '是否需要删除这个用户?',
            icon: <ExclamationCircleFilled/>,
            content: '请确认，该操作可能无法恢复!',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk() {
                setLoading(true);
                // 模拟删除操作
                setTimeout(() => {
                    messageApi.success('删除成功');
                    navigate('/user/list');
                    setLoading(false);
                }, 500);
            },
        });
    }

    return (
        <>
            {contextHolder}
            <Card
                title={userRef.current.id ? "编辑用户" : "新建用户"}
                extra={
                    <Space>
                        <Button 
                            danger 
                            icon={<DeleteOutlined />}
                            onClick={deleteClick}
                            disabled={!userRef.current.id}
                        >
                            删除
                        </Button>
                        <Button 
                            type="primary" 
                            icon={<SaveOutlined />}
                            onClick={showModal}
                        >
                            {userRef.current.id ? "更新" : "创建"}
                        </Button>
                    </Space>
                }
            >
                <Alert 
                    message="提示" 
                    description="请填写用户信息，完成后点击保存按钮" 
                    type="info" 
                    showIcon 
                    style={{ marginBottom: 20 }} 
                />
                
                {!loading ? (
                    <div style={{ padding: '20px 0' }}>
                        <p>用户信息表单将在点击保存按钮后显示</p>
                    </div>
                ) : (
                    <div style={{ padding: '40px 0', textAlign: 'center' }}>加载中...</div>
                )}
            </Card>
            
            <Modal
                title={userRef.current.id ? "编辑用户" : "新建用户"}
                open={open}
                onOk={handleOk}
                onCancel={handleCancel}
                okText={userRef.current.id ? "更新" : "创建"}
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
                        name="username" 
                        label="用户名" 
                        rules={[{ required: true, message: '请输入用户名!', max: 30 }]}
                    >
                        <Input placeholder="请输入用户名" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="password" 
                        label="密码" 
                        rules={[!userRef.current.id ? { required: true, message: '请输入密码!' } : {}]}
                    >
                        <Input type="password" placeholder={userRef.current.id ? "留空表示不修改密码" : "请输入密码"} />
                    </Form.Item>
                    
                    <Form.Item 
                        name="nick_name" 
                        label="昵称" 
                        rules={[{ required: true, message: '请输入昵称!', max: 30 }]}
                    >
                        <Input placeholder="请输入昵称" />
                    </Form.Item>
                    
                    <Form.Item 
                        name="gender" 
                        label="性别" 
                        rules={[{ required: true, message: '请选择性别!' }]}
                    >
                        <Select placeholder="请选择性别">
                            <Option value={1}>男</Option>
                            <Option value={0}>女</Option>
                        </Select>
                    </Form.Item>
                    
                    <Form.Item 
                        name="signature" 
                        label="个性签名"
                    >
                        <Input.TextArea 
                            placeholder="请输入个性签名" 
                            allowClear 
                            autoSize={{ minRows: 3, maxRows: 6 }} 
                            maxLength={100}
                        />
                    </Form.Item>
                    
                    <Form.Item 
                        name="locked" 
                        label="锁定" 
                        valuePropName="checked"
                        normalize={(value) => value ? 1 : 0}
                        initialValue={false}
                    >
                        <Switch checkedChildren="是" unCheckedChildren="否" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    )
}
import {LockOutlined, UserOutlined} from '@ant-design/icons';
import {Button, Checkbox, Form, Input, message, Card, Space} from 'antd';
import { useNavigate} from "react-router";
import LoginService from "../service/LoginService";
import { useState } from "react";


export function LoginPage() {

    const [messageApi, contextHolder] = message.useMessage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const onFinish = (values: any) => {
        setLoading(true);
        LoginService.login(values['username'], values['password'], values['remember'])
            .then((r) => {
                messageApi.success(r.msg);
                navigate('/');
            })
            .catch((error) => {
                messageApi.error('登录失败，请检查用户名和密码');
                console.error('Login error:', error);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    return (
        <>
            {contextHolder}
            <div style={{ 
                minHeight: '100vh', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}>
                <Card 
                    title="博客管理后台登录" 
                    style={{ 
                        width: 400, 
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                        borderRadius: 12
                    }}
                >
                    <Form
                        name="normal_login"
                        initialValues={{remember: true}}
                        onFinish={onFinish}
                    >
                        <Form.Item
                            name="username"
                            rules={[{required: true, message: '请输入用户名!'}]}
                        >
                            <Input 
                                prefix={<UserOutlined className="site-form-item-icon"/>} 
                                size="large" 
                                placeholder="用户名"
                            />
                        </Form.Item>
                        <Form.Item
                            name="password"
                            rules={[{required: true, message: '请输入密码!'}]}
                        >
                            <Input
                                size="large"
                                prefix={<LockOutlined className="site-form-item-icon"/>}
                                type="password"
                                placeholder="密码"
                            />
                        </Form.Item>
                        <Form.Item>
                            <Space direction="vertical" style={{ width: '100%' }}>
                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Form.Item name="remember" valuePropName="checked" noStyle>
                                        <Checkbox>记住我</Checkbox>
                                    </Form.Item>
                                    <a href="#" style={{ color: '#1890ff' }}>
                                        忘记密码
                                    </a>
                                </Space>
                                <Button 
                                    size="large" 
                                    type="primary" 
                                    htmlType="submit" 
                                    style={{ width: '100%' }}
                                    loading={loading}
                                >
                                    登录
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>
            </div>
        </>
    )
}
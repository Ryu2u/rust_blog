import {Alert, Button, Card, Form, Input, Modal, Select, Space, Switch, message} from "antd";
import {DeleteOutlined, ExclamationCircleFilled, SaveOutlined} from "@ant-design/icons";
import {useEffect, useState} from "react";
import {User} from "../../common/Structs";
import {useNavigate, useParams} from "react-router-dom";
import UserService from "../../service/UserService";

export function UserEditPage() {
    const {confirm} = Modal;
    const {id} = useParams();
    const navigate = useNavigate();
    const [form] = Form.useForm();
    const [messageApi, contextHolder] = message.useMessage();
    const [loading, setLoading] = useState(Boolean(id));
    const [submitting, setSubmitting] = useState(false);
    const isEdit = Boolean(id);

    useEffect(() => {
        if (!id) {
            form.setFieldsValue({
                gender: 1,
                role: 'user',
                locked: false,
            });
            return;
        }

        setLoading(true);
        UserService.userGet(parseInt(id, 10)).then((res) => {
            const user: User = res.obj;
            form.setFieldsValue({
                id: user.id,
                username: user.username,
                nick_name: user.nick_name,
                gender: user.gender,
                signature: user.signature || '',
                locked: user.locked === 1,
                role: user.role || 'user',
            });
        }).catch(() => {
            messageApi.error("获取用户信息失败");
        }).finally(() => {
            setLoading(false);
        });
    }, [form, id, messageApi]);

    const onFinish = (values: {
        username: string;
        password?: string;
        nick_name: string;
        gender: number;
        signature?: string;
        locked: boolean;
        role: string;
    }) => {
        setSubmitting(true);
        const payload: User = {
            id: id ? parseInt(id, 10) : 0,
            username: values.username,
            password: values.password || "",
            nick_name: values.nick_name,
            gender: values.gender,
            signature: values.signature || "",
            locked: values.locked ? 1 : 0,
            created_time: 0,
            role: values.role,
        };

        const request = isEdit
            ? UserService.userUpdate(payload)
            : UserService.userAdd(payload);

        request.then((res) => {
            messageApi.success(res.msg || (isEdit ? "更新成功" : "创建成功"));
            navigate("/user/list");
        }).catch(() => {
            messageApi.error(isEdit ? "更新失败" : "创建失败");
        }).finally(() => {
            setSubmitting(false);
        });
    };

    const deleteClick = () => {
        if (!id) {
            return;
        }
        confirm({
            title: '是否删除这个用户?',
            icon: <ExclamationCircleFilled/>,
            content: '删除后无法恢复，请再次确认。',
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk() {
                return UserService.userDelete(parseInt(id, 10)).then((res) => {
                    messageApi.success(res.msg || '删除成功');
                    navigate('/user/list');
                }).catch(() => {
                    messageApi.error('删除失败');
                });
            },
        });
    };

    return (
        <>
            {contextHolder}
            <Card
                title={isEdit ? "编辑用户" : "新建用户"}
                extra={
                    <Space>
                        {isEdit && (
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={deleteClick}
                            >
                                删除
                            </Button>
                        )}
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={() => form.submit()}
                            loading={submitting}
                        >
                            {isEdit ? "保存" : "创建"}
                        </Button>
                    </Space>
                }
            >
                <Alert
                    message="提示"
                    description="这里已经接入真实用户接口，可以直接新增、编辑、锁定和删除用户。"
                    type="info"
                    showIcon
                    style={{marginBottom: 20}}
                />

                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    disabled={loading}
                >
                    <Form.Item
                        label="用户名"
                        name="username"
                        rules={[
                            {required: true, message: "请输入用户名"},
                            {max: 30, message: "用户名不能超过 30 个字符"},
                        ]}
                    >
                        <Input placeholder="请输入用户名"/>
                    </Form.Item>

                    <Form.Item
                        label="密码"
                        name="password"
                        rules={isEdit ? [] : [{required: true, message: "请输入密码"}]}
                        extra={isEdit ? "留空表示不修改密码" : undefined}
                    >
                        <Input.Password placeholder={isEdit ? "留空表示不修改密码" : "请输入密码"}/>
                    </Form.Item>

                    <Form.Item
                        label="昵称"
                        name="nick_name"
                        rules={[
                            {required: true, message: "请输入昵称"},
                            {max: 30, message: "昵称不能超过 30 个字符"},
                        ]}
                    >
                        <Input placeholder="请输入昵称"/>
                    </Form.Item>

                    <Form.Item
                        label="性别"
                        name="gender"
                        rules={[{required: true, message: "请选择性别"}]}
                    >
                        <Select
                            options={[
                                {label: '男', value: 1},
                                {label: '女', value: 0},
                                {label: '其他', value: 2},
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="角色"
                        name="role"
                        rules={[{required: true, message: "请选择角色"}]}
                    >
                        <Select
                            options={[
                                {label: '普通用户', value: 'user'},
                                {label: '管理员', value: 'admin'},
                            ]}
                        />
                    </Form.Item>

                    <Form.Item
                        label="个性签名"
                        name="signature"
                    >
                        <Input.TextArea
                            rows={4}
                            maxLength={120}
                            showCount
                            placeholder="请输入个性签名"
                        />
                    </Form.Item>

                    <Form.Item
                        label="锁定账号"
                        name="locked"
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="锁定" unCheckedChildren="正常"/>
                    </Form.Item>
                </Form>
            </Card>
        </>
    )
}

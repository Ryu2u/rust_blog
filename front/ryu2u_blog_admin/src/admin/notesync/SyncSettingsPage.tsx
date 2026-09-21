import {useEffect, useState} from "react";
import {Button, Card, Form, Input, message, Switch} from "antd";
import NoteSyncService from "../../service/NoteSyncService";
import {Result} from "../../common/Structs";

interface ConfigVo {
    ai_enabled: number;
    ai_base_url: string;
    ai_model: string;
    ai_api_key_masked: string;
    updated_at: number;
}

export function SyncSettingsPage() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        NoteSyncService.getConfig().then((res: Result) => {
            if (res?.code === 200 && res.obj) {
                const c: ConfigVo = res.obj;
                form.setFieldsValue({
                    enabled: c.ai_enabled === 1,
                    base_url: c.ai_base_url,
                    model: c.ai_model,
                });
            }
        });
    }, [form]);

    const onSave = () => {
        form.validateFields().then((v) => {
            setLoading(true);
            NoteSyncService.saveConfig(v.enabled ? 1 : 0, v.base_url, v.model, v.api_key || undefined)
                .then((res: Result) => {
                    if (res?.code === 200) {
                        message.success("保存成功");
                        form.setFieldValue("api_key", undefined);
                    } else {
                        message.error(res?.msg || "保存失败");
                    }
                })
                .finally(() => setLoading(false));
        });
    };

    const onTest = () => {
        setTesting(true);
        NoteSyncService.testAi().then((res: Result) => {
            if (res?.code === 200) {
                message.success(res.obj?.reply || "连通正常");
            } else {
                message.error(res?.msg || "测试失败");
            }
        }).finally(() => setTesting(false));
    };

    return (
        <Card title="同步设置 · AI 元数据" style={{margin: 16}}>
            <Form form={form} layout="vertical" style={{maxWidth: 520}}>
                <Form.Item name="enabled" label="启用 AI 元数据生成" valuePropName="checked">
                    <Switch/>
                </Form.Item>
                <Form.Item name="base_url" label="Base URL（OpenAI 兼容，必须 https）"
                    rules={[{required: true, message: "必填"},
                            {pattern: /^https:\/\//, message: "必须以 https:// 开头"}]}>
                    <Input placeholder="https://api.deepseek.com/v1"/>
                </Form.Item>
                <Form.Item name="model" label="模型 ID" rules={[{required: true, message: "必填"}]}>
                    <Input placeholder="deepseek-flash"/>
                </Form.Item>
                <Form.Item name="api_key" label="API Key（留空 = 保持已有）">
                    <Input.Password placeholder="sk-..."/>
                </Form.Item>
                <Form.Item>
                    <Button type="primary" loading={loading} onClick={onSave}>保存</Button>
                    <Button style={{marginLeft: 8}} loading={testing} onClick={onTest}>测试连接</Button>
                </Form.Item>
            </Form>
            <div style={{color: "#888", fontSize: 12}}>
                说明：AI 为同步的笔记生成标题/摘要/标签/分类，并判定是否可公开；AI 不可用时笔记默认隐藏。
            </div>
        </Card>
    );
}

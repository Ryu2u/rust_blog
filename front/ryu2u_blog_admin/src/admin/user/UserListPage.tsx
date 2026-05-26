import { Table, TableProps, Tag, Input, Button, Space, Row, Col, Select, Popconfirm, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, User } from "../../common/Structs";
import { formatDate } from "../../common/utils";
import { UserOutlined, SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";

const { Option } = Select;
const { Search } = Input;

interface SearchParams {
  keyword: string;
  status: number | null;
}

export const UserListPage = () => {

    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [searchParams, setSearchParams] = useState<SearchParams>({
        keyword: '',
        status: null
    });
    const [messageApi, contextHolder] = message.useMessage();

    const [userList, setUserList] = useState<User[]>([]);

    useEffect(() => {
        setTimeout(() => {
            setUserList([
                {
                    id: 1,
                    username: 'admin',
                    nick_name: '管理员',
                    gender: 1,
                    avatar_path: '',
                    signature: '系统管理员',
                    role: 'admin',
                    created_time: Date.now() - 30 * 24 * 60 * 60 * 1000,
                    locked: 0
                },
                {
                    id: 2,
                    username: 'user1',
                    nick_name: '测试用户1',
                    gender: 1,
                    avatar_path: '',
                    signature: '这是一个测试用户',
                    role: 'user',
                    created_time: Date.now() - 15 * 24 * 60 * 60 * 1000,
                    locked: 0
                },
                {
                    id: 3,
                    username: 'user2',
                    nick_name: '测试用户2',
                    gender: 0,
                    avatar_path: '',
                    signature: '这是另一个测试用户',
                    role: 'user',
                    created_time: Date.now() - 5 * 24 * 60 * 60 * 1000,
                    locked: 1
                }
            ]);
            setLoading(false);
        }, 500);
    }, []);

    const handleDelete = (id: number) => {
        setLoading(true);
        setTimeout(() => {
            setUserList(userList.filter(user => user.id !== id));
            messageApi.success('删除成功');
            setLoading(false);
        }, 500);
    };

    const handleLock = (id: number, locked: number) => {
        setLoading(true);
        setTimeout(() => {
            setUserList(userList.map(user =>
                user.id === id ? { ...user, locked: locked === 1 ? 0 : 1 } : user
            ));
            messageApi.success(locked === 1 ? '解锁成功' : '锁定成功');
            setLoading(false);
        }, 500);
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的用户');
            return;
        }
        setLoading(true);
        setTimeout(() => {
            setUserList(userList.filter(user => !selectedRowKeys.includes(user.id)));
            setSelectedRowKeys([]);
            messageApi.success('批量删除成功');
            setLoading(false);
        }, 500);
    };

    const columns: TableProps<User>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            render: (value) => <span style={{ color: '#555555' }}>{value}</span>,
        },
        {
            title: '用户信息',
            dataIndex: 'username',
            key: 'username',
            render: (username, record) => (
                <Space size="middle">
                    <UserOutlined style={{ fontSize: 20, color: '#555555' }} />
                    <div>
                        <div style={{ color: '#e0e0e0' }}>{username}</div>
                        <div style={{ fontSize: 12, color: '#555555' }}>{record.nick_name}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: '性别',
            dataIndex: 'gender',
            key: 'gender',
            render: (gender) => (
                <Tag style={{
                    background: '#0a0a0a',
                    border: '1px solid #333333',
                    color: '#808080',
                    borderRadius: 0,
                }}>
                    {gender === 1 ? '男' : '女'}
                </Tag>
            ),
        },
        {
            title: '个性签名',
            dataIndex: 'signature',
            key: 'signature',
            ellipsis: true,
            render: (value) => <span style={{ color: '#808080' }}>{value}</span>,
        },
        {
            title: '状态',
            dataIndex: 'locked',
            key: 'locked',
            render: (locked) => (
                <Tag style={{
                    background: locked === 1 ? '#1a1a1a' : '#10a37f',
                    color: locked === 1 ? '#808080' : '#000000',
                    border: 'none',
                    borderRadius: 0,
                }}>
                    {locked === 1 ? '锁定' : '正常'}
                </Tag>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time) => <span style={{ color: '#808080' }}>{formatDate(new Date(created_time))}</span>,
        },
        {
            title: '操作',
            key: 'action',
            width: 220,
            fixed: 'right',
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => navigate(`/user/edit/${record.id}`)}
                        style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                    >
                        编辑
                    </Button>
                    <Button
                        icon={record.locked === 1 ? <UnlockOutlined /> : <LockOutlined />}
                        size="small"
                        onClick={() => handleLock(record.id, record.locked)}
                        style={{ borderRadius: 0, border: '1px solid #333333', color: '#808080' }}
                    >
                        {record.locked === 1 ? '解锁' : '锁定'}
                    </Button>
                    <Popconfirm
                        title="确定要删除这个用户吗？"
                        description="删除后将无法恢复"
                        onConfirm={() => handleDelete(record.id)}
                        okText="确定"
                        cancelText="取消"
                    >
                        <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="small"
                            style={{ borderRadius: 0 }}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const paginationChange = (index: number, size: number) => {
        pageInfoRef.current.page_num = index;
        pageInfoRef.current.page_size = size;
    };

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
    };

    const handleReset = () => {
        setSearchParams({
            keyword: '',
            status: null
        });
        pageInfoRef.current.page_num = 1;
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => {
            setSelectedRowKeys(keys);
        },
    };

    return (
        <>
            {contextHolder}
            <div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #333333',
                }}>
                    <div style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 700 }}>
                        <span style={{ color: '#10a37f' }}>&gt;</span> 用户管理
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/user/edit')}
                        style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                    >
                        新建用户
                    </Button>
                </div>

                <div style={{ border: '1px solid #333333', padding: '16px', marginBottom: '16px', background: '#0a0a0a' }}>
                    <Row gutter={16} align="middle">
                        <Col span={12}>
                            <Search
                                placeholder="搜索用户名或昵称"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: '#555555' }} />}
                            />
                        </Col>
                        <Col span={6}>
                            <Select
                                placeholder="状态"
                                value={searchParams.status}
                                onChange={(value) => setSearchParams({ ...searchParams, status: value })}
                                style={{ width: '100%' }}
                                allowClear
                            >
                                <Option value={0}>正常</Option>
                                <Option value={1}>锁定</Option>
                            </Select>
                        </Col>
                        <Col span={6}>
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<SearchOutlined />}
                                    onClick={handleSearch}
                                    style={{ borderRadius: 0, background: '#10a37f', border: 'none' }}
                                >
                                    搜索
                                </Button>
                                <Button
                                    onClick={handleReset}
                                    style={{ borderRadius: 0, border: '1px solid #333333', color: '#808080' }}
                                >
                                    重置
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </div>

                {selectedRowKeys.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '8px 12px', background: '#0a0a0a', border: '1px solid #333333' }}>
                        <Space>
                            <span style={{ color: '#808080' }}>已选择 {selectedRowKeys.length} 项</span>
                            <Popconfirm
                                title="确定要批量删除这些用户吗？"
                                description="删除后将无法恢复"
                                onConfirm={handleBatchDelete}
                                okText="确定"
                                cancelText="取消"
                            >
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    style={{ borderRadius: 0 }}
                                >
                                    批量删除
                                </Button>
                            </Popconfirm>
                        </Space>
                    </div>
                )}

                <Table
                    loading={loading}
                    columns={columns}
                    pagination={{
                        showSizeChanger: true,
                        onChange: paginationChange,
                        total: userList.length,
                        defaultPageSize: 10,
                        showTotal: (total) => `共 ${total} 个用户`
                    }}
                    rowKey={(record) => record.id!}
                    dataSource={userList}
                    rowSelection={rowSelection}
                    style={{ tableLayout: 'fixed' }}
                />
            </div>
        </>
    );
};
import { Table, TableProps, Tag, Input, Button, Space, Row, Col, Select, Popconfirm, message } from "antd";
import { useEffect, useRef, useState } from "react";
import { PageInfo, User } from "../../common/Structs";
import { formatDate } from "../../common/utils";
import { UserOutlined, SearchOutlined, DeleteOutlined, EditOutlined, PlusOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";
import UserService from "../../service/UserService";

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
        getDataList();
    }, []);

    const handleDelete = (id: number) => {
        setLoading(true);
        UserService.userDelete(id).then((res) => {
            messageApi.success(res.msg || '删除成功');
            getDataList();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleLock = (id: number, locked: number) => {
        setLoading(true);
        UserService.userLock(id).then((res) => {
            messageApi.success(res.msg || (locked === 1 ? '解锁成功' : '锁定成功'));
            getDataList();
        }).catch(() => {
            setLoading(false);
        });
    };

    const handleBatchDelete = () => {
        if (selectedRowKeys.length === 0) {
            messageApi.warning('请选择要删除的用户');
            return;
        }
        setLoading(true);
        Promise.all(selectedRowKeys.map((key) => UserService.userDelete(Number(key))))
            .then(() => {
            getDataList();
            setSelectedRowKeys([]);
            messageApi.success('批量删除成功');
        }).catch(() => {
            setLoading(false);
        });
    };

    const columns: TableProps<User>['columns'] = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            render: (value) => <span style={{ color: 'var(--color-text-muted)' }}>{value}</span>,
        },
        {
            title: '用户信息',
            dataIndex: 'username',
            key: 'username',
            render: (username, record) => (
                <Space size="middle">
                    <UserOutlined style={{ fontSize: 20, color: 'var(--color-text-muted)' }} />
                    <div>
                        <div style={{ color: 'var(--color-text)' }}>{username}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{record.nick_name}</div>
                    </div>
                </Space>
            ),
        },
        {
            title: '性别',
            dataIndex: 'gender',
            key: 'gender',
            render: (gender) => (
                <Tag className="admin-tag">
                    {gender === 1 ? '男' : gender === 2 ? '其他' : '女'}
                </Tag>
            ),
        },
        {
            title: '角色',
            dataIndex: 'role',
            key: 'role',
            render: (role) => (
                <Tag className={role === 'admin' ? 'admin-tag admin-tag--active' : 'admin-tag'}>
                    {role === 'admin' ? '管理员' : '普通用户'}
                </Tag>
            ),
        },
        {
            title: '个性签名',
            dataIndex: 'signature',
            key: 'signature',
            ellipsis: true,
            render: (value) => <span style={{ color: 'var(--color-text-secondary)' }}>{value || '-'}</span>,
        },
        {
            title: '状态',
            dataIndex: 'locked',
            key: 'locked',
            render: (locked) => (
                <Tag className={locked === 1 ? 'admin-tag' : 'admin-tag admin-tag--active'}>
                    {locked === 1 ? '锁定' : '正常'}
                </Tag>
            ),
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time) => <span style={{ color: 'var(--color-text-secondary)' }}>{formatDate(new Date(created_time))}</span>,
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
                    >
                        编辑
                    </Button>
                    <Button
                        icon={record.locked === 1 ? <UnlockOutlined /> : <LockOutlined />}
                        size="small"
                        onClick={() => handleLock(record.id, record.locked)}
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
        getDataList();
    };

    const handleSearch = () => {
        pageInfoRef.current.page_num = 1;
        getDataList();
    };

    const handleReset = () => {
        setSearchParams({
            keyword: '',
            status: null
        });
        pageInfoRef.current.page_num = 1;
        getDataList('', null);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => {
            setSelectedRowKeys(keys);
        },
    };

    function getDataList(keyword = searchParams.keyword, status = searchParams.status) {
        setLoading(true);
        UserService.userListPage({
            page_num: pageInfoRef.current.page_num,
            page_size: pageInfoRef.current.page_size,
            keyword: keyword || undefined,
            status,
        }).then((result) => {
            const pageInfo: PageInfo = result.obj;
            pageInfoRef.current = pageInfo;
            setUserList(pageInfo.list || []);
        }).catch(() => {
            messageApi.error('获取用户列表失败');
        }).finally(() => {
            setLoading(false);
        });
    }

    return (
        <>
            {contextHolder}
            <div>
                <div className="admin-page-head">
                    <h2 className="admin-page-title">用户管理</h2>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/user/edit')}
                    >
                        新建用户
                    </Button>
                </div>

                <div className="admin-filter-panel">
                    <Row gutter={16} align="middle">
                        <Col span={12}>
                            <Search
                                placeholder="搜索用户名或昵称"
                                value={searchParams.keyword}
                                onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                                onSearch={handleSearch}
                                style={{ width: '100%' }}
                                prefix={<SearchOutlined style={{ color: 'var(--color-text-muted)' }} />}
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
                                >
                                    搜索
                                </Button>
                                <Button
                                    onClick={handleReset}
                                >
                                    重置
                                </Button>
                            </Space>
                        </Col>
                    </Row>
                </div>

                {selectedRowKeys.length > 0 && (
                    <div className="admin-selection-bar">
                        <Space>
                            <span style={{ color: 'var(--color-text-secondary)' }}>已选择 {selectedRowKeys.length} 项</span>
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
                        current: pageInfoRef.current.page_num,
                        onChange: paginationChange,
                        total: pageInfoRef.current.total,
                        pageSize: pageInfoRef.current.page_size,
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

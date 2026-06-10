import { Typography, Card, Table, Tag, Space, Button, Empty } from 'antd'
import { EditOutlined, DeleteOutlined } from '@ant-design/icons'

const { Title } = Typography

export default function DocumentManage() {
  const columns = [
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    { title: '类型', dataIndex: 'file_type', key: 'file_type' },
    { title: '大小', dataIndex: 'file_size', key: 'file_size' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          pending: 'orange',
          processing: 'blue',
          completed: 'green',
          failed: 'red',
        }
        return <Tag color={colorMap[status] ?? 'default'}>{status}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button type="link" icon={<EditOutlined />}>编辑</Button>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Title level={2}>文档管理</Title>
      <Card style={{ marginTop: 16 }}>
        <Table columns={columns} dataSource={[]} rowKey="id" locale={{ emptyText: <Empty description="暂无文档" /> }} />
      </Card>
    </div>
  )
}

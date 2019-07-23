# ConfigerManager
RedisConfigerManager


现在已经支持的操作

1. set 的 set 和 get del 方法

2. map(hash) 的 set 和 get del 方法

3. array(list) 的 set 和 get del 方法

现在不支持的操作

SortedSet 的各种操作

set, map(hash), array(list) 的插入操作

与redis command 的不同
1） 为了保持统一， string 类型的 key 也不支持覆盖

2） del 命令也需要提供 key 的类型

后续的改进地方

1） 支持所有类型的 key 的覆盖

2） 提供 set, map(hash), array(list) 的插入操作

3） 考虑对 sortedSort 的支持

特点

1） 对 RedisAuthor 数据库的某一部分 key 进行管理， 管理的所有 key 从 smembers configName 获得

2） 支持多机协同， 管理的 key 发生 add 或 del 操作时， pub 这个消息

3） configName 相同的 client 会收到消息， 然后执行 init 操作

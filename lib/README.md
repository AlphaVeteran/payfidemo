# Foundry dependencies

首次克隆仓库后在本目录安装依赖：

```bash
cd payfidemo
# forge install 依赖 git 子模块；若目录尚未是仓库，先执行：git init
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std@v1.9.4
forge build
forge test
```

安装完成后应出现：

- `lib/openzeppelin-contracts/`
- `lib/forge-std/`

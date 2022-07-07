import { BigNumber, Contract, providers } from "ethers";
import { defaultAbiCoder as abiCoder } from "ethers/lib/utils";
import { ERC20ABI, UniswapV2ABI } from "../metadata/abis";
import { OhmAddress } from "../metadata/addresses";

type JsonRpcProvider = providers.JsonRpcProvider;

export class Uniswap {
    static abi = UniswapV2ABI;

    private liquidityPool: Contract;

    private acceptableSlippage: number;

    private ohmToBorrow: string;

    private provider: JsonRpcProvider;

    constructor(
        lpAddress: string,
        slippage: number = 0.01,
        ohmAmount: string,
        provider: JsonRpcProvider
    ) {
        this.provider = provider;
        
        this.liquidityPool = new Contract(lpAddress, Uniswap.abi, this.provider);

        this.acceptableSlippage = (1 - slippage) * 100;

        this.ohmToBorrow = ohmAmount;
    }

    async getTokenA(): Promise<string> {
        if (!this.liquidityPool)
            throw new Error("Liquidity pool not initialized");
        return this.liquidityPool.token0();
    }

    async getTokenADecimals(): Promise<string> {
        if (!this.liquidityPool)
            throw new Error("Liquidity pool not initialized");

        const tokenAAddress = await this.getTokenA();
        const tokenAContract = new Contract(tokenAAddress, ERC20ABI, this.provider);
        const tokenADecimals = await tokenAContract.decimals();

        return tokenADecimals;
    }

    async getTokenB(): Promise<string> {
        if (!this.liquidityPool)
            throw new Error("Liquidity pool not initialized");
        return this.liquidityPool.token1();
    }

    async getTokenBDecimals(): Promise<string> {
        if (!this.liquidityPool)
            throw new Error("Liquidity pool not initialized");

        const tokenBAddress = await this.getTokenB();
        const tokenBContract = new Contract(tokenBAddress, ERC20ABI, this.provider);
        const tokenBDecimals = await tokenBContract.decimals();

        return tokenBDecimals;
    }

    async getReserveRatio(): Promise<string> {
        if (!this.liquidityPool)
            throw new Error("Liquidity pool not initialized");

        const reservesInfo = await this.liquidityPool.getReserves();

        const reservesA = reservesInfo[0];
        const tokenADecimals = await this.getTokenADecimals();

        const reservesB = reservesInfo[1];
        const tokenBDecimals = await this.getTokenBDecimals();

        const isPrecisionEqual = BigNumber.from(tokenADecimals).eq(tokenBDecimals);
        const isTokenAMorePrecise = BigNumber.from(tokenADecimals).gt(tokenBDecimals);

        if (isPrecisionEqual)
            return BigNumber.from(reservesA).div(reservesB).mul("100").toString();

        if (isTokenAMorePrecise) {
            const decimalAdjustment = BigNumber.from(tokenADecimals).div(tokenBDecimals);
            const adjustedReservesB = decimalAdjustment.mul(reservesB);
            return BigNumber.from(reservesA).div(adjustedReservesB).mul("100").toString();
        }

        const decimalAdjustment = BigNumber.from(tokenBDecimals).div(tokenADecimals);
        const adjustedReservesA = decimalAdjustment.mul(reservesA);
        return adjustedReservesA.div(reservesB).mul("100").toString();
    }

    async getEncodedParams() {
        const tokenA = await this.getTokenA();
        let tokenAAmount: string;
        let minTokenAOut: string;

        const tokenB = await this.getTokenB();
        let tokenBAmount: string;
        let minTokenBOut: string;

        const reserveRatio = await this.getReserveRatio();

        if (tokenA == OhmAddress) {
            tokenAAmount = this.ohmToBorrow;
            minTokenAOut = BigNumber.from(tokenAAmount)
                .mul(this.acceptableSlippage)
                .div("100")
                .toString();

            tokenBAmount = BigNumber.from(tokenAAmount)
                .mul("100")
                .div(reserveRatio)
                .toString();
            minTokenBOut = BigNumber.from(tokenBAmount)
                .mul(this.acceptableSlippage)
                .div("100")
                .toString();
        } else {
            tokenBAmount = this.ohmToBorrow;
            minTokenBOut = BigNumber.from(tokenBAmount)
                .mul(this.acceptableSlippage)
                .div("100")
                .toString();

            tokenAAmount = BigNumber.from(tokenBAmount)
                .mul(reserveRatio)
                .div("100")
                .toString();
            minTokenAOut = BigNumber.from(tokenAAmount)
                .mul(this.acceptableSlippage)
                .div("100")
                .toString();
        }

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "uint256", "uint256", "uint256"],
            [
                tokenA,
                tokenB,
                tokenAAmount,
                tokenBAmount,
                minTokenAOut,
                minTokenBOut,
            ]
        );
        return encodedParams;
    }
}

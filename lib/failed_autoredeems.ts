import { providers } from 'ethers'
import { Provider } from '@ethersproject/abstract-provider'
import { BlockTag } from '@ethersproject/abstract-provider'
require('dotenv').config()
const {
  EventFetcher,
  addCustomChain,
  L1TransactionReceipt,
  L1ToL2MessageStatus,
} = require('@arbitrum/sdk')

import { xai } from './networks'

import { Inbox__factory } from '@arbitrum/sdk/dist/lib/abi/factories/Inbox__factory'

const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC)
const l3Provider = new providers.JsonRpcProvider(process.env.L3RPC)

try {
  addCustomChain({ customChain: xai })
} catch (error: any) {
  console.error(`Failed to register Xai: ${error.message}`)
}

const getInboxMessageDeliveredEventData = async (
  l2InboxAddress: string,
  filter: {
    fromBlock: BlockTag
    toBlock: BlockTag
  },
  l1Provider: Provider
) => {
  const eventFetcher = new EventFetcher(l1Provider)
  const logs = await eventFetcher.getEvents(
    Inbox__factory,
    (g: any) => g.filters.InboxMessageDelivered(),
    { ...filter, address: l2InboxAddress }
  )
  return logs
}

const checkRetryablesOneOff = async () => {
  const toBlock = 169107937
  const fromBlock = 167420400

  await checkFailedAutoRedeems(
    l2Provider,
    l3Provider,
    xai.ethBridge.inbox,
    fromBlock,
    toBlock
  )
}

const checkFailedAutoRedeems = async (
  l2Provider: Provider,
  l3Provider: Provider,
  bridgeAddress: string,
  fromBlock: number,
  toBlock: number
) => {
  let inboxDeliveredLogs

  inboxDeliveredLogs = await getInboxMessageDeliveredEventData(
    bridgeAddress,
    { fromBlock, toBlock },
    l2Provider
  )
  console.log(inboxDeliveredLogs.length)

  for (let inboxDeliveredLog of inboxDeliveredLogs) {
    if (inboxDeliveredLog.data.length === 706) continue // depositETH bypass
    const { transactionHash: l2TxHash } = inboxDeliveredLog

    const l2TxReceipt = await l2Provider.getTransactionReceipt(l2TxHash)

    const arbL2TxReceipt = new L1TransactionReceipt(l2TxReceipt)

    const messages = await arbL2TxReceipt.getL1ToL2Messages(l3Provider)
    console.log(messages.length)

    for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
      const message = messages[msgIndex]

      console.log(message.retryableCreationId)

      let status = await message.status()
      if (status === L1ToL2MessageStatus.REDEEMED) {
        console.log(
          `Retryable expired: l1tx: ${l2TxHash} msg Index: ${msgIndex}`
        )
      }
    }
  }
}


checkRetryablesOneOff()

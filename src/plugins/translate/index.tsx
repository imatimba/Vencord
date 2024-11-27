/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import { addChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { addAccessory, removeAccessory } from "@api/MessageAccessories";
import { addPreSendListener, removePreSendListener } from "@api/MessageEvents";
import { addButton, removeButton } from "@api/MessagePopover";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { ChannelStore, Menu, MessageStore, UserStore } from "@webpack/common";
import { Message } from "discord-types/general";

import { settings } from "./settings";
import { setShouldShowTranslateEnabledTooltip, TranslateChatBarIcon, TranslateIcon } from "./TranslateIcon";
import { handleTranslate, TranslationAccessory } from "./TranslationAccessory";
import { translate } from "./utils";

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message.content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-trans"
            label="Translate"
            icon={TranslateIcon}
            action={async () => {
                const trans = await translate("received", message.content);
                handleTranslate(message.id, trans);
            }}
        />
    ));
};

export default definePlugin({
    name: "Translate",
    description: "Translate messages with Google Translate",
    authors: [Devs.Ven, Devs.MrDiamond],
    dependencies: ["MessageAccessoriesAPI", "MessagePopoverAPI", "MessageEventsAPI", "ChatInputButtonAPI"],
    settings,
    contextMenus: {
        "message": messageCtxPatch
    },
    // not used, just here in case some other plugin wants it or w/e
    translate,

    start() {
        addAccessory("vc-translation", props => <TranslationAccessory message={props.message} />);

        addChatBarButton("vc-translate", TranslateChatBarIcon);

        addButton("vc-translate", message => {
            if (!message.content) return null;

            return {
                label: "Translate",
                icon: TranslateIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => {
                    const trans = await translate("received", message.content);
                    handleTranslate(message.id, trans);
                }
            };
        });

        let tooltipTimeout: any;
        this.preSend = addPreSendListener(async (_, message) => {
            if (!settings.store.autoTranslate) return;
            if (!message.content) return;

            setShouldShowTranslateEnabledTooltip?.(true);
            clearTimeout(tooltipTimeout);
            tooltipTimeout = setTimeout(() => setShouldShowTranslateEnabledTooltip?.(false), 2000);

            const trans = await translate("sent", message.content);
            message.content = trans.text;

        });
    },

    stop() {
        removePreSendListener(this.preSend);
        removeChatBarButton("vc-translate");
        removeButton("vc-translate");
        removeAccessory("vc-translation");
    },

    flux: {
        MESSAGE_CREATE: async event => {
            try {
                const currentChannel = Vencord.Util.getCurrentChannel().id;

                const autoTranslate = (await DataStore.get("autoTranslateReceived"))[currentChannel];
                if (!autoTranslate) return;

                if (event.channelId !== currentChannel) return;
                if (event.message.author.id === UserStore.getCurrentUser().id) return;

                const trans = await translate("received", event.message.content);
                handleTranslate(event.message.id, trans);
            } catch (e) { }
        },
        CHANNEL_SELECT: async () => {
            try {
                const currentChannel = Vencord.Util.getCurrentChannel().id;

                const autoTranslate = (await DataStore.get("autoTranslateReceived"))[currentChannel];
                if (!autoTranslate) return;

                const { amountToAutoTranslate } = settings.store;

                const messages: Message[] = await MessageStore.getMessages(currentChannel)._array.reverse();

                for (let i = 0; i < amountToAutoTranslate; i++) {
                    const message = messages[i];
                    if (!message) return;

                    const trans = await translate("received", message.content);
                    handleTranslate(message.id, trans);
                }
            } catch (e) { }
        }
    }
});

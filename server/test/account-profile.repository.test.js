import assert from "node:assert/strict";
import test from "node:test";

import {
    createAccountProfileRepository
} from "../src/data/account-profile.repository.js";

test(
    "findProfileByUserId returns account profile with preference",
    async () => {
        let capturedSql;
        let capturedParameters;

        const database = {
            async query(sql, parameters) {
                capturedSql = sql;
                capturedParameters = parameters;

                return {
                    rows: [
                        {
                            user_id: "42",
                            username: "profile-test-user",
                            role: "user",
                            audio_quality_preference:
                                "test-quality"
                        }
                    ]
                };
            }
        };

        const repository =
            createAccountProfileRepository(database);

        const profile =
            await repository.findProfileByUserId("42");

        assert.deepEqual(
            profile,
            {
                user_id: "42",
                username: "profile-test-user",
                role: "user",
                audio_quality_preference:
                    "test-quality"
            }
        );

        assert.deepEqual(
            capturedParameters,
            ["42"]
        );

        assert.match(
            capturedSql,
            /LEFT\s+JOIN\s+user_preferences/i
        );

        assert.match(
            capturedSql,
            /WHERE\s+u\.id\s*=\s*\$1/i
        );

        assert.doesNotMatch(
            capturedSql,
            /password_hash/i
        );
    }
);

test(
    "findProfileByUserId returns profile when preference is unset",
    async () => {
        const database = {
            async query() {
                return {
                    rows: [
                        {
                            user_id: "7",
                            username: "no-preference-user",
                            role: "user",
                            audio_quality_preference: null
                        }
                    ]
                };
            }
        };

        const repository =
            createAccountProfileRepository(database);

        const profile =
            await repository.findProfileByUserId("7");

        assert.equal(
            profile.audio_quality_preference,
            null
        );
    }
);

test(
    "findProfileByUserId returns null when user does not exist",
    async () => {
        const database = {
            async query() {
                return {
                    rows: []
                };
            }
        };

        const repository =
            createAccountProfileRepository(database);

        const profile =
            await repository.findProfileByUserId("999999");

        assert.equal(
            profile,
            null
        );
    }
);

test(
    "createAccountProfileRepository requires database query function",
    () => {
        assert.throws(
            () => createAccountProfileRepository(null),
            {
                name: "TypeError"
            }
        );

        assert.throws(
            () => createAccountProfileRepository({}),
            {
                name: "TypeError"
            }
        );
    }
);

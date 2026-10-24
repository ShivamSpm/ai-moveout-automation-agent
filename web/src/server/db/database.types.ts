
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "a2a_tasks": {
                  Row: {
                    "action_id": string | null,"id": string,"owner_id": string,"task": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "action_id"?: string | null,"id": string,"owner_id": string,"task": NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "action_id"?: string | null,"id"?: string,"owner_id"?: string,"task"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "a2a_tasks_action_id_fkey"
      columns: ["action_id"]
isOneToOne: false
      referencedRelation: "actions"
      referencedColumns: ["id"]
    }
                  ]
                },"action_events": {
                  Row: {
                    "action_id": string,"at": string,"detail": Json | null,"event": string,"id": number,"owner_id": string
                  }
                  Insert: {
                    "action_id": string,"at"?: string,"detail"?: Json | null,"event": string,"id"?: never,"owner_id"?: string
                  }
                  Update: {
                    "action_id"?: string,"at"?: string,"detail"?: Json | null,"event"?: string,"id"?: never,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "action_events_action_id_fkey"
      columns: ["action_id"]
isOneToOne: false
      referencedRelation: "actions"
      referencedColumns: ["id"]
    }
                  ]
                },"actions": {
                  Row: {
                    "approved_at": string | null,"approved_hash": string | null,"attempts": number,"created_at": string,"error": string | null,"executed_at": string | null,"execution_mode": string | null,"id": string,"idempotency_key": string,"kind": string,"move_id": string,"owner_id": string,"payload": NonNullable<Json>,"payload_hash": string,"provider_ref": string | null,"provider_url": string | null,"status": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_hash"?: string | null,"attempts"?: number,"created_at"?: string,"error"?: string | null,"executed_at"?: string | null,"execution_mode"?: string | null,"id"?: string,"idempotency_key"?: string,"kind": string,"move_id": string,"owner_id"?: string,"payload": NonNullable<Json>,"payload_hash"?: string,"provider_ref"?: string | null,"provider_url"?: string | null,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_hash"?: string | null,"attempts"?: number,"created_at"?: string,"error"?: string | null,"executed_at"?: string | null,"execution_mode"?: string | null,"id"?: string,"idempotency_key"?: string,"kind"?: string,"move_id"?: string,"owner_id"?: string,"payload"?: NonNullable<Json>,"payload_hash"?: string,"provider_ref"?: string | null,"provider_url"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "actions_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"chat_messages": {
                  Row: {
                    "content": string,"created_at": string,"id": string,"move_id": string,"owner_id": string,"role": string,"tool_calls": Json | null
                  }
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: string,"move_id": string,"owner_id"?: string,"role": string,"tool_calls"?: Json | null
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: string,"move_id"?: string,"owner_id"?: string,"role"?: string,"tool_calls"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"cleaning_providers": {
                  Row: {
                    "accepts_pets": boolean,"active": boolean,"base_usd": number,"bulky_items_surcharge_usd": number,"cancellation_policy": string,"carpet_usd_per_room": number,"created_at": string,"day_end_hour": number,"day_start_hour": number,"deep_clean_usd": number,"display_name": string,"id": string,"inside_appliances_usd": number,"is_simulated": boolean,"max_jobs_per_day": number,"min_notice_hours": number,"no_elevator_surcharge_usd": number,"notes": string | null,"offers_carpet": boolean,"offers_inside_appliances": boolean,"offers_walls": boolean,"offers_windows": boolean,"per_bathroom_usd": number,"per_bedroom_usd": number,"pet_surcharge_usd": number,"rating": number,"review_count": number,"rush_pct": number,"rush_window_hours": number,"service_zips": (string)[],"slug": string,"walls_usd": number,"windows_usd": number,"works_weekdays": (number)[]
                  }
                  Insert: {
                    "accepts_pets": boolean,"active"?: boolean,"base_usd": number,"bulky_items_surcharge_usd": number,"cancellation_policy": string,"carpet_usd_per_room": number,"created_at"?: string,"day_end_hour": number,"day_start_hour": number,"deep_clean_usd": number,"display_name": string,"id"?: string,"inside_appliances_usd": number,"is_simulated"?: boolean,"max_jobs_per_day": number,"min_notice_hours": number,"no_elevator_surcharge_usd": number,"notes"?: string | null,"offers_carpet": boolean,"offers_inside_appliances": boolean,"offers_walls": boolean,"offers_windows": boolean,"per_bathroom_usd": number,"per_bedroom_usd": number,"pet_surcharge_usd": number,"rating": number,"review_count": number,"rush_pct": number,"rush_window_hours": number,"service_zips": (string)[],"slug": string,"walls_usd": number,"windows_usd": number,"works_weekdays": (number)[]
                  }
                  Update: {
                    "accepts_pets"?: boolean,"active"?: boolean,"base_usd"?: number,"bulky_items_surcharge_usd"?: number,"cancellation_policy"?: string,"carpet_usd_per_room"?: number,"created_at"?: string,"day_end_hour"?: number,"day_start_hour"?: number,"deep_clean_usd"?: number,"display_name"?: string,"id"?: string,"inside_appliances_usd"?: number,"is_simulated"?: boolean,"max_jobs_per_day"?: number,"min_notice_hours"?: number,"no_elevator_surcharge_usd"?: number,"notes"?: string | null,"offers_carpet"?: boolean,"offers_inside_appliances"?: boolean,"offers_walls"?: boolean,"offers_windows"?: boolean,"per_bathroom_usd"?: number,"per_bedroom_usd"?: number,"pet_surcharge_usd"?: number,"rating"?: number,"review_count"?: number,"rush_pct"?: number,"rush_window_hours"?: number,"service_zips"?: (string)[],"slug"?: string,"walls_usd"?: number,"windows_usd"?: number,"works_weekdays"?: (number)[]
                  }
                  Relationships: [

                  ]
                },"connector_tokens": {
                  Row: {
                    "created_at": string,"id": string,"label": string,"last_used_at": string | null,"owner_id": string,"revoked_at": string | null,"token_hash": string,"token_hint": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"label"?: string,"last_used_at"?: string | null,"owner_id"?: string,"revoked_at"?: string | null,"token_hash": string,"token_hint": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string,"last_used_at"?: string | null,"owner_id"?: string,"revoked_at"?: string | null,"token_hash"?: string,"token_hint"?: string
                  }
                  Relationships: [

                  ]
                },"conversations": {
                  Row: {
                    "buyer_label": string,"created_at": string,"external_thread_ref": string | null,"id": string,"listing_id": string,"owner_id": string,"source": string
                  }
                  Insert: {
                    "buyer_label": string,"created_at"?: string,"external_thread_ref"?: string | null,"id"?: string,"listing_id": string,"owner_id"?: string,"source": string
                  }
                  Update: {
                    "buyer_label"?: string,"created_at"?: string,"external_thread_ref"?: string | null,"id"?: string,"listing_id"?: string,"owner_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_listing_id_owner_id_fkey"
      columns: ["listing_id","owner_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "byte_size": number,"id": string,"kind": string,"mime_type": string,"move_id": string,"original_name": string | null,"owner_id": string,"page_count": number | null,"sha256": string,"shared_with_household": boolean,"storage_path": string,"uploaded_at": string
                  }
                  Insert: {
                    "byte_size": number,"id"?: string,"kind": string,"mime_type": string,"move_id": string,"original_name"?: string | null,"owner_id"?: string,"page_count"?: number | null,"sha256": string,"shared_with_household"?: boolean,"storage_path": string,"uploaded_at"?: string
                  }
                  Update: {
                    "byte_size"?: number,"id"?: string,"kind"?: string,"mime_type"?: string,"move_id"?: string,"original_name"?: string | null,"owner_id"?: string,"page_count"?: number | null,"sha256"?: string,"shared_with_household"?: boolean,"storage_path"?: string,"uploaded_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "documents_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "accepted_at": string | null,"expires_at": string | null,"household_id": string,"id": string,"invite_token_hash": string | null,"invited_at": string,"invited_email": string,"role": string,"status": string,"user_id": string | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"expires_at"?: string | null,"household_id": string,"id"?: string,"invite_token_hash"?: string | null,"invited_at"?: string,"invited_email": string,"role": string,"status": string,"user_id"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"expires_at"?: string | null,"household_id"?: string,"id"?: string,"invite_token_hash"?: string | null,"invited_at"?: string,"invited_email"?: string,"role"?: string,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [

                  ]
                },"item_photos": {
                  Row: {
                    "document_id": string,"item_id": string,"owner_id": string
                  }
                  Insert: {
                    "document_id": string,"item_id": string,"owner_id"?: string
                  }
                  Update: {
                    "document_id"?: string,"item_id"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_photos_document_id_owner_id_fkey"
      columns: ["document_id","owner_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","owner_id"]
    },{
      foreignKeyName: "item_photos_item_id_owner_id_fkey"
      columns: ["item_id","owner_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"items": {
                  Row: {
                    "ask_cents": number | null,"category": string | null,"condition": string | null,"created_at": string,"description": string | null,"disposition": string,"disposition_confirmed": boolean,"floor_cents": number | null,"id": string,"move_id": string,"name": string,"owner_id": string,"proposed_by": string,"status": string,"updated_at": string
                  }
                  Insert: {
                    "ask_cents"?: number | null,"category"?: string | null,"condition"?: string | null,"created_at"?: string,"description"?: string | null,"disposition"?: string,"disposition_confirmed"?: boolean,"floor_cents"?: number | null,"id"?: string,"move_id": string,"name": string,"owner_id"?: string,"proposed_by"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "ask_cents"?: number | null,"category"?: string | null,"condition"?: string | null,"created_at"?: string,"description"?: string | null,"disposition"?: string,"disposition_confirmed"?: boolean,"floor_cents"?: number | null,"id"?: string,"move_id"?: string,"name"?: string,"owner_id"?: string,"proposed_by"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"lease_findings": {
                  Row: {
                    "confidence": string,"confirmed": boolean,"created_at": string,"document_id": string | null,"extractor": string,"id": string,"move_id": string,"owner_id": string,"page": number | null,"quote": string | null,"rule_key": string,"value": Json | null
                  }
                  Insert: {
                    "confidence": string,"confirmed"?: boolean,"created_at"?: string,"document_id"?: string | null,"extractor": string,"id"?: string,"move_id": string,"owner_id"?: string,"page"?: number | null,"quote"?: string | null,"rule_key": string,"value"?: Json | null
                  }
                  Update: {
                    "confidence"?: string,"confirmed"?: boolean,"created_at"?: string,"document_id"?: string | null,"extractor"?: string,"id"?: string,"move_id"?: string,"owner_id"?: string,"page"?: number | null,"quote"?: string | null,"rule_key"?: string,"value"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lease_findings_document_id_owner_id_fkey"
      columns: ["document_id","owner_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","owner_id"]
    },{
      foreignKeyName: "lease_findings_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "area_label": string | null,"body": string,"channel": string,"created_at": string,"delegate": string | null,"external_ref": string | null,"external_url": string | null,"id": string,"item_id": string,"mode": string,"owner_id": string,"price_cents": number,"published_at": string | null,"status": string,"title": string
                  }
                  Insert: {
                    "area_label"?: string | null,"body": string,"channel": string,"created_at"?: string,"delegate"?: string | null,"external_ref"?: string | null,"external_url"?: string | null,"id"?: string,"item_id": string,"mode": string,"owner_id"?: string,"price_cents": number,"published_at"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "area_label"?: string | null,"body"?: string,"channel"?: string,"created_at"?: string,"delegate"?: string | null,"external_ref"?: string | null,"external_url"?: string | null,"id"?: string,"item_id"?: string,"mode"?: string,"owner_id"?: string,"price_cents"?: number,"published_at"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_item_id_owner_id_fkey"
      columns: ["item_id","owner_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "action_id": string | null,"body": string,"conversation_id": string,"created_at": string,"direction": string,"id": string,"owner_id": string,"source": string
                  }
                  Insert: {
                    "action_id"?: string | null,"body": string,"conversation_id": string,"created_at"?: string,"direction": string,"id"?: string,"owner_id"?: string,"source": string
                  }
                  Update: {
                    "action_id"?: string | null,"body"?: string,"conversation_id"?: string,"created_at"?: string,"direction"?: string,"id"?: string,"owner_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_owner_id_fkey"
      columns: ["conversation_id","owner_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"moves": {
                  Row: {
                    "address_private": string | null,"area_label": string | null,"created_at": string,"deposit_cents": number | null,"household_id": string | null,"id": string,"landlord_email": string | null,"landlord_name": string | null,"move_in_date": string | null,"move_out_date": string | null,"owner_id": string,"party_role": string,"timezone": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "address_private"?: string | null,"area_label"?: string | null,"created_at"?: string,"deposit_cents"?: number | null,"household_id"?: string | null,"id"?: string,"landlord_email"?: string | null,"landlord_name"?: string | null,"move_in_date"?: string | null,"move_out_date"?: string | null,"owner_id"?: string,"party_role"?: string,"timezone"?: string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address_private"?: string | null,"area_label"?: string | null,"created_at"?: string,"deposit_cents"?: number | null,"household_id"?: string | null,"id"?: string,"landlord_email"?: string | null,"landlord_name"?: string | null,"move_in_date"?: string | null,"move_out_date"?: string | null,"owner_id"?: string,"party_role"?: string,"timezone"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moves_household_id_owner_id_fkey"
      columns: ["household_id","owner_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"reservations": {
                  Row: {
                    "conversation_id": string,"created_at": string,"id": string,"item_id": string,"owner_id": string,"pickup_end": string | null,"pickup_start": string | null,"price_cents": number | null,"status": string
                  }
                  Insert: {
                    "conversation_id": string,"created_at"?: string,"id"?: string,"item_id": string,"owner_id"?: string,"pickup_end"?: string | null,"pickup_start"?: string | null,"price_cents"?: number | null,"status"?: string
                  }
                  Update: {
                    "conversation_id"?: string,"created_at"?: string,"id"?: string,"item_id"?: string,"owner_id"?: string,"pickup_end"?: string | null,"pickup_start"?: string | null,"price_cents"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reservations_conversation_id_owner_id_fkey"
      columns: ["conversation_id","owner_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id","owner_id"]
    },{
      foreignKeyName: "reservations_item_id_owner_id_fkey"
      columns: ["item_id","owner_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "created_at": string,"detail": string | null,"document_id": string | null,"due_date": string | null,"id": string,"lane": string,"move_id": string,"owner_id": string,"phase": string,"source": string | null,"source_kind": string,"status": string,"task_key": string,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"detail"?: string | null,"document_id"?: string | null,"due_date"?: string | null,"id"?: string,"lane": string,"move_id": string,"owner_id"?: string,"phase"?: string,"source"?: string | null,"source_kind": string,"status"?: string,"task_key": string,"title": string
                  }
                  Update: {
                    "created_at"?: string,"detail"?: string | null,"document_id"?: string | null,"due_date"?: string | null,"id"?: string,"lane"?: string,"move_id"?: string,"owner_id"?: string,"phase"?: string,"source"?: string | null,"source_kind"?: string,"status"?: string,"task_key"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_document_id_owner_id_fkey"
      columns: ["document_id","owner_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id","owner_id"]
    },{
      foreignKeyName: "tasks_move_id_owner_id_fkey"
      columns: ["move_id","owner_id"]
isOneToOne: false
      referencedRelation: "moves"
      referencedColumns: ["id","owner_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "a2a_task_load":
{ Args: { "p_id": string,"p_owner_id": string }; Returns: Json
                           },
"a2a_task_save":
{ Args: { "p_action_id": string,"p_id": string,"p_owner_id": string,"p_task": Json }; Returns: undefined
                           },
"accept_household_invite":
{ Args: { "token_hash": string }; Returns: string
                           },
"approve_action":
{ Args: { "p_action_id": string,"p_payload_hash": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_action":
{ Args: { "p_action_id": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"claim_action":
{ Args: { "p_action_id": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_google_credentials":
{ Args: { "p_owner_id": string }; Returns: {
              "access_token": string,"access_token_expires_at": string,"google_email": string,"refresh_token": string,"scopes": (string)[]
            }[]
                           },
"google_connection_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "connected": boolean,"google_email": string,"scopes": (string)[]
            }[]
                           },
"household_moves":
{ Args: Record<PropertyKey, never>; Returns: {
              "household_id": string,"id": string,"move_out_date": string,"owner_id": string,"title": string
            }[]
                           },
"invite_household_member":
{ Args: { "email": string,"h": string,"token_hash": string }; Returns: string
                           },
"muse_buyer_message":
{ Args: { "p_body": string,"p_buyer_label": string,"p_listing_id": string,"p_owner_id": string,"p_thread_ref": string }; Returns: string
                           },
"muse_claim":
{ Args: { "p_action_id": string,"p_owner_id": string,"p_payload_hash": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"muse_listings":
{ Args: { "p_owner_id": string }; Returns: {
              "external_url": string,"item_status": string,"listing_id": string,"status": string,"title": string
            }[]
                           },
"muse_queue":
{ Args: { "p_owner_id": string }; Returns: {
              "action_id": string,"approved_at": string,"attempts": number,"kind": string,"payload": Json,"payload_hash": string,"photo_paths": (string)[],"status": string,"title": string
            }[]
                           },
"muse_report":
{ Args: { "p_action_id": string,"p_external_ref"?: string,"p_external_url"?: string,"p_note"?: string,"p_owner_id": string,"p_payload_hash": string,"p_status": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"record_action_result":
{ Args: { "p_action_id": string,"p_error"?: string,"p_mode": string,"p_provider_ref"?: string,"p_provider_url"?: string,"p_status": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"reopen_unknown_action":
{ Args: { "p_action_id": string }; Returns: {
              "approved_at": string | null,
"approved_hash": string | null,
"attempts": number,
"created_at": string,
"error": string | null,
"executed_at": string | null,
"execution_mode": string | null,
"id": string,
"idempotency_key": string,
"kind": string,
"move_id": string,
"owner_id": string,
"payload": NonNullable<Json>,
"payload_hash": string,
"provider_ref": string | null,
"provider_url": string | null,
"status": string,
"title": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "actions"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolve_connector_token":
{ Args: { "p_token_hash": string }; Returns: string
                           },
"revoke_household_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"save_google_credentials":
{ Args: { "p_access_token": string,"p_email": string,"p_expires_at": string,"p_owner_id": string,"p_refresh_token": string,"p_scopes": (string)[] }; Returns: undefined
                           },
"save_lease_result":
{ Args: { "doc": string,"findings": Json,"plan": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const

